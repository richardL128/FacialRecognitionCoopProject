# `src/` guide

`src/` contains the web application. Put route files in `app/`, reusable presentation in `components/`, cross-route server code in `lib/`, browser hooks in `hooks/`, and static configuration in `constants/`.

Read the child guide before changing `app/` or `lib/`. Keep feature UI close to its route where it is not shared; promote a component only when it has a genuine cross-feature contract. Keep database access and restricted-data handling out of browser components.

