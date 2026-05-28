import type { UiLocale } from "./types";

type Dict = Record<string, string>;

const en: Dict = {
  "common.showDetails": "+ Show more",
  "common.hideDetails": "− Show less",
  "common.classic": "Classic",
  "common.premium": "Premium",
  "common.signOut": "Sign out",
  "common.viewAll": "See all →",
  "common.open": "Open",
  "common.localeLabel.en": "EN",
  "common.localeLabel.hi": "हिं",

  "sidebar.dashboard": "Home",
  "sidebar.visualiser": "Paint Preview",
  "sidebar.customerCodes": "Customer Links",

  "dashboard.title": "Home",
  "dashboard.newProject": "+ New Project",
  "dashboard.greeting": "Hi, {name}",
  "dashboard.summary": "{count} open projects · {used} colours tried this month",
  "dashboard.kpi.triesLeft": "Tries left",
  "dashboard.kpi.openProjects": "Open projects",
  "dashboard.recent": "Recent Projects",
  "dashboard.table.project": "Project",
  "dashboard.table.customer": "Customer",
  "dashboard.table.shade": "Colour",
  "dashboard.table.updated": "Last opened",

  "portal.title": "Customer Links",
  "portal.newCode": "+ New Link",
  "portal.table.code": "Link",
  "portal.table.customer": "Customer",
  "portal.table.timeLeft": "Time left",
  "portal.table.status": "Status",
  "portal.status.active": "Active",
  "portal.status.expired": "Expired",

  "atelier.title": "Paint Preview",
};

const hi: Dict = {
  "common.showDetails": "+ और देखें",
  "common.hideDetails": "− बंद करें",
  "common.classic": "क्लासिक",
  "common.premium": "प्रीमियम",
  "common.signOut": "बाहर निकलें",
  "common.viewAll": "सभी देखें →",
  "common.open": "खोलें",
  "common.localeLabel.en": "EN",
  "common.localeLabel.hi": "हिं",

  "sidebar.dashboard": "होम",
  "sidebar.visualiser": "पेंट देखें",
  "sidebar.customerCodes": "ग्राहक लिंक",

  "dashboard.title": "होम",
  "dashboard.newProject": "+ नया प्रोजेक्ट",
  "dashboard.greeting": "नमस्ते, {name}",
  "dashboard.summary": "{count} खुले प्रोजेक्ट · इस महीने {used} रंग आज़माए",
  "dashboard.kpi.triesLeft": "बची कोशिशें",
  "dashboard.kpi.openProjects": "खुले प्रोजेक्ट",
  "dashboard.recent": "हाल के प्रोजेक्ट",
  "dashboard.table.project": "प्रोजेक्ट",
  "dashboard.table.customer": "ग्राहक",
  "dashboard.table.shade": "रंग",
  "dashboard.table.updated": "अंतिम बार खोला",

  "portal.title": "ग्राहक लिंक",
  "portal.newCode": "+ नया लिंक",
  "portal.table.code": "लिंक",
  "portal.table.customer": "ग्राहक",
  "portal.table.timeLeft": "बचा समय",
  "portal.table.status": "स्थिति",
  "portal.status.active": "चालू",
  "portal.status.expired": "बंद",

  "atelier.title": "पेंट देखें",
};

const dictionaries: Record<UiLocale, Dict> = { en, hi };

export type TranslationKey = keyof typeof en;

export function t(locale: UiLocale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? en;
  let str = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
