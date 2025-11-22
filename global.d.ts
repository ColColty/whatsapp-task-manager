// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type Messages = typeof import("./src/locales/en.json");
declare interface IntlMessages extends Messages { void; }
