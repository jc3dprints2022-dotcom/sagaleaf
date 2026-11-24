/** GoatCounter account for cookieless page-view counts. Mirrors GOATCOUNTER_CODE in the root site.config.js. */
export const GOATCOUNTER_CODE = 'saga-proxima'

/** Runs in the browser at load: skips localhost so dev and Playwright never call GoatCounter. */
export const GOATCOUNTER_LOADER = `(function(){var h=location.hostname;if(h==="localhost"||h==="127.0.0.1")return;var s=document.createElement("script");s.async=true;s.src="https://gc.zgo.at/count.js";s.setAttribute("data-goatcounter","https://${GOATCOUNTER_CODE}.goatcounter.com/count");document.head.appendChild(s)})();`
