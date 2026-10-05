import { cookies, headers } from "next/headers";
import { cache } from "react";
import { COPY, LANG_COOKIE, pickLang, type Copy } from "./copy";

/** Textos del idioma de esta request (una lectura de cookie/cabecera por render). */
export const getT = cache(async (): Promise<Copy> => {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return COPY[pickLang(jar.get(LANG_COOKIE)?.value, h.get("accept-language"))];
});
