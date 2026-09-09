import "dayjs/locale/zh-cn";
import "dayjs/locale/id";

import antdEnUS from "antd/locale/en_US";
import antdIdID from "antd/locale/id_ID";
import antdZhCN from "antd/locale/zh_CN";
import { I18n, langList, setConfig, type TLanguage } from "@lovrabet/i18n";
import locales from "@/locales";

export type { TLanguage } from "@lovrabet/i18n";

export const APPLICATION_CODE = "app-4d050189";
export const APPLICATION_PACKAGE = "ei-demo";
export const supportedLanguages = ["zh-CN", "en-US", "id-ID"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

function isSupportedLanguage(
  language: TLanguage,
): language is SupportedLanguage {
  return supportedLanguages.some((item) => item === language);
}

// @lovrabet/i18n 会通过全局语言 Cookie 与 Lovrabet 主应用保持一致。
// setConfig 必须在创建 I18n 实例前执行。
setConfig({ langList: [...supportedLanguages] });

export const $i18n = new I18n({
  locale: locales,
  componentName: APPLICATION_CODE,
  packageName: APPLICATION_PACKAGE,
});

export const allowLangs = langList.filter((item) =>
  isSupportedLanguage(item.value),
);

const detectedLanguage = $i18n.getLang();
export const currentLanguage: SupportedLanguage = isSupportedLanguage(
  detectedLanguage,
)
  ? detectedLanguage
  : "zh-CN";

export const antdLocaleByLanguage = {
  "zh-CN": antdZhCN,
  "en-US": antdEnUS,
  "id-ID": antdIdID,
} as const;

export const dayjsLocaleByLanguage: Record<SupportedLanguage, string> = {
  "zh-CN": "zh-cn",
  "en-US": "en",
  "id-ID": "id",
};

export const antdLocale = antdLocaleByLanguage[currentLanguage];
export const dayjsLocale = dayjsLocaleByLanguage[currentLanguage] || "zh-cn";

export function setApplicationLanguage(language: TLanguage) {
  if (!isSupportedLanguage(language)) return;
  $i18n.setLang(language);
  window.location.reload();
}
