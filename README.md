# Marquito Barbiere — Sito web

Sito responsive per "Marquito Barbiere", Via Marco Polo 50, Rignano
Flaminio (RM) — 353 449 9910.

## Struttura del progetto

- **`index.html`** — sito completo (HTML/CSS/JS in un unico file, foto
  reali incorporate come base64). Apribile direttamente nel browser o
  deployabile su qualsiasi host statico (Netlify, Vercel, GitHub Pages).
- **`google-calendar-booking.gs`** — backend Google Apps Script per le
  prenotazioni: calcola la disponibilità reale sul Google Calendar di
  Marco in base al servizio scelto, e crea l'evento alla conferma.
- **`appsscript.json`** — manifest del progetto Apps Script (fuso orario,
  permessi web app).
- **`SETUP_PRENOTAZIONI.txt`** — guida passo-passo (non tecnica) per
  collegare Google Calendar e pubblicare il backend.

## Servizi e orari

| Servizio | Durata |
|---|---|
| Barba | 10 min |
| Taglio | 25 min |
| Taglio + barba | 35 min |

Orari: 08:30–13:00 e 15:30–20:00, tutti i giorni.

## Stato prenotazioni

Il sito è pronto lato frontend (`BOOKING_API_URL` è impostato su `"DEMO"`
per ora, mostra un flusso di esempio). Per renderlo reale, seguire
`SETUP_PRENOTAZIONI.txt`: serve l'ID del Google Calendar di Marco e il
deploy di `google-calendar-booking.gs` come Web App (richiede l'accesso
all'account Google di Marco).

## Stile

Bianco + arancione, mobile-first. Le foto nella galleria "Lavori reali"
sono foto vere del negozio/dei clienti — da non sostituire con immagini
stock.
