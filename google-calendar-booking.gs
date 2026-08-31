/**
 * MARQUITO BARBIERE — Backend prenotazioni (Google Apps Script)
 *
 * Espone un Web App con due azioni, chiamate da index.html:
 *   GET  ?action=availability&date=YYYY-MM-DD&service=NomeServizio
 *        -> { ok:true, slots:["09:00","09:30",...] }
 *   POST { action:"book", service, date, time, name, phone, email }
 *        -> { ok:true } oppure { ok:false, error:"..." }
 *
 * La disponibilità è calcolata così:
 *   1. Si genera una griglia di orari (ogni SLOT_GRID_MINUTES) dentro le
 *      finestre di apertura del giorno (OPENING_HOURS).
 *   2. Si scartano gli orari troppo vicini a "adesso" (MIN_LEAD_MINUTES).
 *   3. Si scartano gli orari che si sovrappongono a un evento già presente
 *      nel Google Calendar di Marco (CALENDAR_ID).
 * Al momento della conferma prenotazione, il controllo di disponibilità
 * viene rifatto server-side (con un lock) prima di creare l'evento, per
 * evitare doppie prenotazioni da due clienti che guardano lo stesso slot
 * nello stesso istante.
 */

const CONFIG = {
  // TODO: sostituisci con l'ID del calendario Google di Marco.
  // Lo trovi in Google Calendar > impostazioni del calendario > "ID calendario"
  // (es. "marco.barbiere@gmail.com" se usa il calendario principale del suo account).
  CALENDAR_ID: 'INSERISCI_QUI_ID_CALENDARIO_DI_MARCO',

  TIMEZONE: 'Europe/Rome',

  // Durata di ogni servizio in minuti — presa da README_CLAUDE.md, non modificare
  // senza conferma di Marco.
  SERVICES: {
    'Barba': 10,
    'Taglio': 25,
    'Taglio + barba': 35
  },

  // Passo della griglia oraria (ogni quanto può iniziare un appuntamento).
  SLOT_GRID_MINUTES: 30,

  // Non si può prenotare uno slot che inizia tra meno di N minuti da adesso.
  MIN_LEAD_MINUTES: 60,

  // Orari forniti dal cliente: 08:30-13:00 e 15:30-20:00, stessi ogni
  // giorno della settimana finché non specificato diversamente.
  // Per chiudere un giorno specifico della settimana, aggiungi una voce
  // con array vuoto, es. "1": [] per il lunedì chiuso (0=Domenica ... 6=Sabato).
  // Se Marco è chiuso un giorno preciso (ferie, festività), basta che lo
  // blocchi sul suo Google Calendar: uno slot dentro un evento sparisce
  // automaticamente dalle disponibilità, senza bisogno di toccare questo file.
  OPENING_HOURS: {
    default: [
      { start: '08:30', end: '13:00' },
      { start: '15:30', end: '20:00' }
    ]
  }
};

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'availability') {
      return jsonOutput(getAvailability(e.parameter.date, e.parameter.service));
    }
    return jsonOutput({ ok: false, error: 'Azione non valida.' });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'book') {
      return jsonOutput(createBooking(body));
    }
    return jsonOutput({ ok: false, error: 'Azione non valida.' });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getServiceDuration(serviceName) {
  const duration = CONFIG.SERVICES[serviceName];
  if (!duration) throw new Error('Servizio non riconosciuto: ' + serviceName);
  return duration;
}

function isValidDate(dateStr) {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function isValidTime(timeStr) {
  return typeof timeStr === 'string' && /^\d{2}:\d{2}$/.test(timeStr);
}

function getWeekday(dateStr) {
  // Mezzogiorno per evitare sbalzi di giorno per via del fuso orario.
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay(); // 0=Domenica ... 6=Sabato, come Date.getDay() nel frontend
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildGridSlots(dateStr, durationMinutes) {
  const weekday = getWeekday(dateStr);
  const windows = CONFIG.OPENING_HOURS[String(weekday)] || CONFIG.OPENING_HOURS.default || [];
  const slots = [];

  windows.forEach(function (w) {
    const startParts = w.start.split(':').map(Number);
    const endParts = w.end.split(':').map(Number);
    let h = startParts[0];
    let m = startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];

    while (h * 60 + m + durationMinutes <= endMinutes) {
      slots.push(pad(h) + ':' + pad(m));
      m += CONFIG.SLOT_GRID_MINUTES;
      if (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
  });

  return slots;
}

function getBusyIntervals(dateStr) {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('Calendario non trovato: controlla CALENDAR_ID.');

  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59');
  const events = cal.getEvents(dayStart, dayEnd);

  return events.map(function (ev) {
    return { start: ev.getStartTime(), end: ev.getEndTime() };
  });
}

function isFree(start, end, busyIntervals) {
  return !busyIntervals.some(function (b) {
    return start < b.end && end > b.start;
  });
}

function getAvailability(dateStr, serviceName) {
  if (!isValidDate(dateStr)) throw new Error('Data non valida.');
  const duration = getServiceDuration(serviceName);

  const candidates = buildGridSlots(dateStr, duration);
  const busy = getBusyIntervals(dateStr);
  const minStart = new Date(Date.now() + CONFIG.MIN_LEAD_MINUTES * 60000);

  const free = candidates.filter(function (time) {
    const start = new Date(dateStr + 'T' + time + ':00');
    const end = new Date(start.getTime() + duration * 60000);
    if (start < minStart) return false;
    return isFree(start, end, busy);
  });

  return { ok: true, slots: free };
}

function createBooking(body) {
  const service = body.service;
  const dateStr = body.date;
  const time = body.time;
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const email = (body.email || '').trim();

  if (!service || !isValidDate(dateStr) || !isValidTime(time) || !name || !phone) {
    throw new Error('Dati mancanti o non validi.');
  }

  // Non fidarsi della durata mandata dal client: si ricalcola dal servizio.
  const duration = getServiceDuration(service);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const start = new Date(dateStr + 'T' + time + ':00');
    const end = new Date(start.getTime() + duration * 60000);
    const minStart = new Date(Date.now() + CONFIG.MIN_LEAD_MINUTES * 60000);

    if (start < minStart) {
      throw new Error('Questo orario non è più prenotabile (troppo vicino o nel passato). Scegline un altro.');
    }

    const busy = getBusyIntervals(dateStr);
    if (!isFree(start, end, busy)) {
      throw new Error('Questo orario è appena stato prenotato da qualcun altro. Scegline un altro.');
    }

    const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    if (!cal) throw new Error('Calendario non trovato: controlla CALENDAR_ID.');

    const title = service + ' — ' + name;
    let description = 'Servizio: ' + service +
      '\nDurata: ' + duration + ' min' +
      '\nTelefono: ' + phone;
    if (email) description += '\nEmail: ' + email;
    description += '\nPrenotato dal sito il ' +
      Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');

    const options = { description: description };
    if (email) options.guests = email;

    cal.createEvent(title, start, end, options);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
