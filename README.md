# EZpark

Nederlandstalige testsite voor garagebeheer, met een donkere P1-geïnspireerde vormgeving.

## Online demo

Publicatie via GitHub Pages vanuit de map `docs` op de branch `main`. De demo bevat fictieve gegevens. Gebruikersrollen zijn gesimuleerd, niet bedoeld als echte aanmelding of toegangsbeveiliging.

Gegevens worden per browser bewaard. Ze worden niet gedeeld met andere bezoekers en niet naar GitHub gestuurd. Gebruik de export-/importfunctie voor back-ups. De koppelingen met Outlook, Microsoft 365, ParkBase en MijnRooster zijn nog niet aangesloten; verzending wordt gesimuleerd.

## Functies

- Inbox met gebundelde gesprekken, statusfilters, antwoorden, doorzetten en archief.
- Leveranciers en meerdere bijlagen (alleen bestandsnamen in deze demo).
- Agenda met dag/week/maand, garagefilter, toevoegen, bewerken, terugzetbaar verwijderen en mail-/storingkoppelingen.
- Alle rollen kunnen afspraken toevoegen voor hun eigen garages.
- Storingen, dagrapporten, feedback, gebruikersbeheer, individuele rechten en MijnRooster-snelkoppeling.

## Lokaal starten

```sh
python3 server.py
```

Open http://localhost:4174. De lokale server maakt ook bestandsback-ups in `data/`. Deze map is uitgesloten van Git en van de online website.

## Wijzigingen publiceren

```sh
python3 tools/build_pages.py
```

Commit de bronbestanden en de bijgewerkte `docs/`-map. GitHub Pages publiceert daarna automatisch. De bouwstap kopieert uitsluitend HTML, CSS, JavaScript en de hostingconfiguratie; geen gebruikersgegevens.

## Tests

Node.js 20.19+ en npm zijn alleen nodig voor de DOM-tests, niet voor de website zelf.

```sh
npm install
npm test
```

De bron is gebaseerd op de EZpark Sites-demo; de agenda gebruikt de eerdere P1-leveranciersagenda als referentie. De online versie kan geen Python-backend uitvoeren. Voor echt gezamenlijk werken is later een gedeelde backend en echte authenticatie nodig.
