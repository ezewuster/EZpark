# Microsoft 365 — inrichting in voorbereiding

Gewenst: Microsoft 365-werkaccounts, persoonlijke én gedeelde mailboxen/agenda's. Nieuwe bezoekers zien eerst een Microsoft-inlogscherm. Eiko heeft aangegeven zelf beheertoegang te hebben.

## Status

`login.html`, `login.css`, `login.js` en `microsoft-config.js` zijn een voorbereiding op de echte aanmelding. De knop is bewust niet actief zonder een geconfigureerde backend. Deze bestanden zijn nog niet de ingang van de gepubliceerde demo. Er is geen fictieve login die toegang tot echte gegevens pretendeert te beveiligen.

## Nog nodig voor activering

1. Een Microsoft Entra-appregistratie voor uitsluitend de eigen organisatie; bevestig tenant en toepassing-ID. Gebruik een servergerichte OAuth authorization-code-flow via een onderhouden Microsoft-authenticatiebibliotheek. Geen zelfbedachte tokenvalidatie.
2. Een beveiligde backend met HTTPS. De uiteindelijke app en backend horen op dezelfde origin te draaien voor betrouwbare HttpOnly-sessiecookies, ook in Safari. GitHub Pages kan de inlogvoordeur hosten en naar die app verwijzen; GitHub blijft de broncode hosten.
3. Een exacte redirect-URI voor die backend. Geen productie-URI verzinnen voordat de hosting gekozen is. Een certificaat of servergeheim hoort uitsluitend in serverconfiguratie, nooit in deze openbare repository.
4. Alleen noodzakelijke delegated Microsoft Graph-rechten. Start aanmelden met profielrechten; vraag Outlook-toegang pas bij het verbinden van de mailbox. Afhankelijk van de gewenste bewerkingen: `Mail.ReadWrite`, `Mail.ReadWrite.Shared`, `Mail.Send`, `Mail.Send.Shared`, `Calendars.ReadWrite` en `Calendars.ReadWrite.Shared`. Laat de beheerder de concrete scope-set controleren. Geen organisatiebrede application-permissions als standaard.
5. Selecteer expliciet welke gedeelde mailboxen en agenda's beschikbaar worden. Gedelegeerde Graph-toegang respecteert de al bestaande Microsoft-mailboxrechten; EZpark-garagerechten moeten daar server-side aanvullend op worden gecontroleerd.
6. Bestaande demo-accounts aan gevalideerde Microsoft-identiteiten koppelen met tenant-ID en object-ID. Niet automatisch beheerdersrechten afleiden uit naam of e-mailadres. Nieuwe collega's krijgen pas garagetoegang na een expliciete toewijzing. Alle toegewezen rollen mogen afspraken toevoegen.
7. Tokenopslag uitsluitend versleuteld server-side; echte mailinhoud niet opslaan in de huidige demo-localStorage of in GitHub. Houd demo-gegevens gescheiden van Microsoft-gegevens en bied een gecontroleerde migratie aan.

## Synchronisatieontwerp

- Mails bundelen op mailbox + conversationId; message-ID's opslaan met `Prefer: IdType="ImmutableId"`.
- Veranderingen per mailbox/map bijhouden met Microsoft Graph delta-links. Iedere map heeft een eigen synchronisatiestatus.
- Agenda's per geselecteerde kalender en periode synchroniseren; herhalingen en uitzonderingen meenemen. Kalender-delta's horen bij hun oorspronkelijke periode.
- Eenzelfde Outlook-item bij herhaalde synchronisatie bijwerken, niet dupliceren. Outlook-verwijderingen markeren; bestaande EZpark-verslagen en koppelingen behouden.
- Uitgaande wijzigingen expliciet tonen en door de ingelogde gebruiker laten uitvoeren. Geen bestaande demo-afspraken automatisch naar Outlook schrijven en geen deelnemers uitnodigen zonder gerichte gebruikersactie.
- Rechten, conflicten, throttling en verlopen verbindingen behandelen voordat de echte integratie wordt geactiveerd.

## Officiële bronnen

- https://learn.microsoft.com/en-us/entra/msal/python/getting-started/acquiring-tokens
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders
- https://learn.microsoft.com/en-us/graph/outlook-create-event-in-shared-delegated-calendar
- https://learn.microsoft.com/en-us/graph/delta-query-messages
- https://learn.microsoft.com/en-us/graph/delta-query-events
- https://learn.microsoft.com/en-us/graph/outlook-immutable-id
