# CLOG a tool for coffee makers to understand their every cup of home-made coffee
For more, please see" http://clog.puce.vercel.app
# CLOG

> A local-first coffee log for home baristas.  
> Track your brews, beans, cafes, grinders, and machines in one place.

CLOG is a lightweight web app for people who brew coffee at home and want to understand **why one cup tastes better than another**.  
It helps you record brew variables, manage coffee beans and equipment, keep a cafe journal, and review your brewing history with practical feedback.

## Demo

Live demo: http://clog.puce.vercel.app

---

## Features

### 1. Brew logging
Record the details that actually affect your cup:

- brew method
- bean
- date
- machine
- grinder
- grind size
- water temperature
- pressure
- tamp level
- dose / yield
- extraction time
- notes
- score

It also includes a built-in **brew timer**, so you can use it while brewing instead of switching to another app.

### 2. Brew insights
CLOG is not just a notebook.

It can generate practical brew feedback based on what you recorded, such as:

- bitter cup → try coarser grind or shorter extraction
- acidic cup → try finer grind or longer extraction
- low body → slightly increase dose
- too hot / too cool water → adjust brew temperature

This makes it easier to turn each brew into a better next cup.

### 3. Knowledge scopes + AI insight
You can upload your own coffee knowledge files (`.txt`, `.md`, `.json`) and organize them into **knowledge scopes**.

Then CLOG can use the selected scope to generate more relevant suggestions.

It also supports optional AI model settings:

- custom model name
- your own API key
- fallback to local rule-based suggestions when no key is configured

### 4. Bean inventory
Track the beans you currently own:

- bean name
- bean type
- roast level
- open date
- notes
- photo

This helps you keep better control over freshness and rotation.

### 5. Cafe journal
Save cafes you visited — or want to visit later.

For each cafe, you can record:

- status (`Visited` / `Want to visit`)
- location
- equipment
- bean origin
- roasting style
- drink
- rating
- notes
- photo

### 6. Gear library
Create your own coffee equipment library:

- grinders
- coffee machines

This keeps your brew records more consistent and makes comparisons easier over time.

### 7. Local-first data
CLOG stores data locally in your browser and includes:

- export data
- import data
- reset all data

You stay in control of your own records without requiring an account or backend for core usage.

### 8. PWA-ready
The app includes a web manifest and service worker, so it is designed to be installable and more resilient for repeat use.

---

## Why CLOG?

Many coffee note apps only tell you whether a cup was “good” or “bad”.

CLOG focuses on the variables that actually help you improve:

- grind size
- temperature
- pressure
- extraction time
- dose / yield
- sensory notes
- repeatable brew history

It is built for people who want to make better coffee at home, not just collect tasting notes.

---

## Tech Stack

- **HTML**
- **CSS**
- **Vanilla JavaScript (ES Modules)**
- **localStorage**
- **Service Worker**
- **Web App Manifest**

No heavy framework.  
No required backend for the main experience.

---

## Project Structure

```text
CLOG/
├── index.html
├── style.css
├── manifest.webmanifest
├── sw.js
└── js/
    ├── app.js
    ├── beans.js
    ├── brews.js
    ├── cafes.js
    ├── grinders.js
    ├── machines.js
    └── storage.js
Main Sections
Brew

Log a brew with technical parameters, notes, score, and timer.

My Brews

Review saved brews and sort them by machine, date, or score.

Golden Rules

Built-in grinding and extraction logic for practical coffee troubleshooting.

Cafes

Manage visited cafes and your wishlist, with notes and ratings.

Beans

Track what beans you have and when they were opened.

My Grinders / My Machines

Keep your equipment organized for more consistent records.

Data

Export, import, and reset local data.

Insight

Upload knowledge files, select scopes, and optionally connect your own AI model settings.

Data & Privacy

CLOG is local-first.

That means:

your records are stored in your browser
exported data is plain JSON
no account is required for core usage
AI insight is optional
when no API key is configured, the app falls back to local rule-based suggestions
Roadmap

Possible next improvements:

richer brew analytics
better filtering and search
more structured flavor descriptors
improved mobile UX
optional cloud sync
multi-language support
stronger recommendation logic
Contributing

Issues and pull requests are welcome.

Good contribution areas:

UI polish
accessibility improvements
search and filtering
better analytics
localization
performance tuning
