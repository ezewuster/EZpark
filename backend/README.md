# Lokale Microsoft 365-proef

Deze aparte service toont eerst het Microsoft-inlogscherm en beschermt de Outlook-werkruimte met een serversessie. De bestaande EZpark-demo, lokale gegevens en GitHub Pages-publicatie zijn niet vervangen. Dit is een geteste technische basis, nog geen geactiveerde of volledige integratie.

## Starten op deze Mac

Voer vanuit de repository uit:

```sh
./start-microsoft.command
```

Open http://localhost:4176 . Zonder Microsoft-configuratie verschijnt het inlogscherm met een duidelijke inrichtingsmelding. De knop wordt pas actief met geldige serverconfiguratie. localhost:4174 is de afzonderlijke bestaande demo.

Voor een nieuwe installatie: maak met Python 3.12 een `.venv` en installeer `backend/requirements.lock.txt`. De startopdracht gebruikt deze venv. Tests: `.venv/bin/python backend/test_backend.py`.

## Appregistratie door P1/ICT

1. Maak in Microsoft Entra een appregistratie voor alleen de eigen organisatie, met platform **Web**. De lokaal toegestane redirect is exact `http://localhost:4176/auth/callback`. Gebruik geen SPA-registratie voor deze backend.
2. Aanmelden vraagt gedelegeerd `User.Read`; Outlook verbinden vraagt aanvullend `Mail.Read.Shared` en `Calendars.Read.Shared`. MSAL verzorgt de OpenID/offline scopes. Laat ICT de toestemmingsvereisten en het organisatiebeleid controleren. Er worden nu geen verzend-, schrijf- of application-rechten gevraagd.
3. Stel de omgevingsvariabelen uit `config.example.env` in op de server. Het voorbeeldbestand wordt niet automatisch geladen. Bewaar echte credentials buiten de repository; geef ze niet door in chat. Maak een versleutelingssleutel met `cryptography.fernet.Fernet.generate_key()` en bewaar die duurzaam en afzonderlijk van de database. Sleutelverlies maakt opgeslagen gegevens onleesbaar.
4. `EZPARK_ADMIN_OBJECT_ID` is het vooraf gecontroleerde Entra-object-ID van de hoofdbeheerder. Geen beheerdersrechten op basis van een ingevoerde naam. Nieuwe gebruikers beginnen zonder garagetoegang.
5. Productie vereist een nog te kiezen HTTPS-backendhosting en bijbehorende exacte redirect. GitHub Pages kan deze Python-service niet uitvoeren. Deze proef is niet naar productie uitgerold. Gebruik daar een WSGI-server, geen Flask-ontwikkelserver; bijvoorbeeld één Gunicorn-worker met `backend.app:create_app()` en serverconfiguratie.

De eerder geopende P1-account kreeg in Appregistraties een 401. De registratie en toestemming moeten daarom nog met een bevoegd organisatieaccount worden geregeld. Er is geen werkende app-ID of credential aangenomen of verzonnen.

## Wat er is gebouwd

- MSAL authorization-code-aanmelding, tenantcontrole, eenmalige flow, korte opaque cookies, CSRF- en origincontrole.
- Versleutelde serveropslag voor tokens, sessies en opgehaalde inhoud; geen Outlook-tokens of echte mail in demo-localStorage.
- Handmatig ophalen van Inbox en Archief via delta-links; bundelen op gesprek. Opnieuw ophalen werkt bij en dupliceert niet. Verwijderde Outlook-items worden gemarkeerd, hun opgeslagen inhoud blijft behouden.
- Handmatig ophalen van de standaardagenda binnen een periode; standaard eigen mailbox, expliciet toegewezen gedeelde mailboxen. Geen achtergrondtaak of webhooks.
- Toegang per Microsoft-identiteit. De beheerder kan bestaande aangemelde gebruikers garages toekennen via `PUT /api/admin/users/<object-id>` met `garages` en `role`; gedeelde toegang via `POST /api/admin/mailbox-grants` met `oid`, `mailbox`, `garages`. Dit zijn beheer-API's met sessie en CSRF, nog zonder beheerscherm. Microsoft-mailboxrechten blijven aanvullend vereist.

## Nog nodig voor volledige EZpark-integratie

Live testen met de echte tenant: toestemming, tokenvernieuwing, eigen/gedeelde mailboxen en agenda's, inclusief delta-ondersteuning en Microsoft-rechten. De tests gebruiken vervangende Microsoft-responsen; ze bewijzen geen werkende verbinding met P1.

De volledige bestaande inbox/agenda/beheerinterface moet nog op deze backend worden aangesloten, met gecontroleerde identiteitskoppeling en gegevensmigratie. Antwoorden, doorzetten, archiveren in Outlook, afspraken terugschrijven, automatische synchronisatie, keuze van andere agenda's en beheerinterface zijn nog niet geïmplementeerd. Er zijn geen echte berichten verzonden, afspraken gewijzigd of bestaande demo-gegevens verwijderd.

Officiële naslag: [MSAL](https://learn.microsoft.com/en-us/entra/msal/python/getting-started/acquiring-tokens), [Graph-rechten](https://learn.microsoft.com/en-us/graph/permissions-reference), [gedeelde mail](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders), [agenda-delta](https://learn.microsoft.com/en-us/graph/delta-query-events).
