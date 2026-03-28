import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

import en from "./locales/en.json";
import ja from "./locales/ja.json";

const LANGUAGE_STORAGE_KEY = "kanban-language";

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
const detectedLanguage = savedLanguage ?? navigator.language.split("-")[0] ?? "en";
const supportedLanguages = ["en", "ja"];
const initialLanguage = supportedLanguages.includes(detectedLanguage) ? detectedLanguage : "en";

i18next.use(initReactI18next).init({
	lng: initialLanguage,
	fallbackLng: "en",
	interpolation: {
		escapeValue: false,
	},
	resources: {
		en: { translation: en },
		ja: { translation: ja },
	},
});

i18next.on("languageChanged", (lng) => {
	localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
});

export { useTranslation };
export default i18next;
