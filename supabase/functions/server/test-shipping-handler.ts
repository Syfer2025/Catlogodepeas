// Test Shipping API handler - separate file to avoid Deno bundler template literal issues
// All string building uses concatenation only (NO template literals)

import * as kv from "./kv_store.tsx";

type StepStatus = "ok" | "warn" | "error";
interface Step { step: string; status: StepStatus; detail: string; ms?: number; }

function addStep(steps: Step[], step: string, status: StepStatus, detail: string, ms?: number) {
  steps.push({ step: step, status: status, detail: detail, ms: ms });
}

function getField(obj: any, path: string): any {
  if (!path) return undefined;
  var cur: any = obj;
  var segs = path.split(".");
  for (var i = 0; i < segs.length; i++) {
    if (cur && typeof cur === "object") cur = cur[segs[i]];
    else return undefined;
  }
  return cur;
}

export async function handleTestShippingApi(
  reqJson: { destCep?: string; weight?: number },
  getAuthUserId: (req: Request) => Promise<string | null>,
  rawReq: Request
): Promise<{ status: number; body: any }> {
  var startTime = Date.now();
  var steps: Step[] = [];

  try {
    var userId = await getAuthUserId(rawReq);
    if (!userId) return { status: 401, body: { error: "Unauthorized" } };
    addStep(steps, "Autenticacao", "ok", "Usuario autenticado");

    var destCep = (reqJson.destCep || "").replace(/\D/g, "");
    if (destCep.length !== 8) {
      return { status: 400, body: { error: "CEP de destino invalido (8 digitos).", steps: steps } };
    }

    var cfg: any = (await kv.get("shipping_config")) || {};
    var apiConfig = cfg.apiConfig;

    if (!apiConfig) {
      addStep(steps, "Config API", "error", "apiConfig nao encontrada. Salve a configuracao primeiro.");
      return { status: 200, body: { ok: false, steps: steps, parsedOptions: [], rawResponse: null } };
    }
    addStep(steps, "Config API", "ok", "Provider: " + (apiConfig.provider || "custom") + ", URL: " + (apiConfig.apiUrl || "(vazio)"));

    if (!apiConfig.apiUrl) {
      addStep(steps, "URL da API", "error", "URL da API esta vazia. Preencha na aba API Externa.");
      return { status: 200, body: { ok: false, steps: steps, parsedOptions: [], rawResponse: null } };
    }

    if (!apiConfig.enabled) {
      addStep(steps, "API Habilitada", "warn", "API esta DESABILITADA. O teste executara mesmo assim, mas o calculo real nao usara a API ate habilitar.");
    } else {
      addStep(steps, "API Habilitada", "ok", "API esta habilitada");
    }

    var provider = apiConfig.provider || "custom";
    var totalWeight = reqJson.weight || cfg.defaultWeight || 1;
    var originCep = cfg.originCep || "";

    if (!originCep) {
      addStep(steps, "CEP Origem", "warn", "CEP de origem nao configurado na aba Geral. Enviando vazio.");
    } else {
      addStep(steps, "CEP Origem", "ok", originCep);
    }

    var fm = apiConfig.fieldMapping || null;
    if (fm) {
      addStep(steps, "Field Mapping", "ok",
        "optionsPath=\"" + (fm.optionsPath || "(raiz)") + "\", name=\"" + fm.carrierName + "\", price=\"" + fm.price + "\", days=\"" + fm.deliveryDays + "\""
      );
    } else {
      addStep(steps, "Field Mapping", "warn", "Nenhum mapeamento configurado. Tentara deteccao automatica.");
    }

    // Build request
    var fetchUrl = apiConfig.apiUrl;
    var fetchHd: Record<string, string> = { "Content-Type": "application/json" };
    var fetchBody: any = null;

    if (provider === "melhor_envio") {
      fetchUrl = "https://melhorenvio.com.br/api/v2/me/shipment/calculate";
      fetchHd.Authorization = "Bearer " + (apiConfig.apiToken || "");
      fetchHd.Accept = "application/json";
      fetchHd["User-Agent"] = "Carretao Auto Pecas (contato@carretao.com)";
      fetchBody = {
        from: { postal_code: originCep },
        to: { postal_code: destCep },
        "package": { height: 10, width: 15, length: 20, weight: totalWeight },
      };
    } else if (provider === "frenet") {
      fetchUrl = "https://api.frenet.com.br/shipping/quote";
      fetchHd.token = apiConfig.apiToken;
      fetchBody = {
        SellerCEP: originCep,
        RecipientCEP: destCep,
        ShipmentInvoiceValue: 0,
        ShippingItemArray: [{ Height: 10, Length: 20, Width: 15, Weight: totalWeight, Quantity: 1 }],
      };
    } else if (provider === "sisfrete") {
      // SisFrete Cotacao API
      fetchUrl = apiConfig.apiUrl || "https://cotar.sisfrete.com.br/cotacao/Integracao.php";
      fetchHd.token = apiConfig.apiToken;
      fetchBody = {
        destination: destCep,
        items: [{
          seller_id: "",
          sku: "test-item",
          quantity: 1,
          origin: originCep,
          price: 100,
          dimensions: {
            length: 20,
            height: 10,
            width: 15,
            weight: totalWeight
          }
        }]
      };
    } else {
      // Custom API - support GET or POST and optional body template
      if (apiConfig.apiToken) fetchHd.Authorization = "Bearer " + apiConfig.apiToken;
      var tpl = apiConfig.requestBodyTemplate || "";
      if (tpl) {
        try {
          var rendered = tpl
            .replace(/\{\{originCep\}\}/g, originCep)
            .replace(/\{\{destCep\}\}/g, destCep)
            .replace(/\{\{weight\}\}/g, String(totalWeight));
          fetchBody = JSON.parse(rendered);
          addStep(steps, "Body Template", "ok", "Template renderizado com sucesso");
        } catch (tplErr: any) {
          addStep(steps, "Body Template", "error", "Erro ao processar template: " + (tplErr.message || tplErr));
          fetchBody = { originCep: originCep, destCep: destCep, weight: totalWeight, items: [] };
        }
      } else {
        fetchBody = { originCep: originCep, destCep: destCep, weight: totalWeight, items: [] };
      }
    }

    var httpMethod = (provider === "custom" && apiConfig.httpMethod) ? apiConfig.httpMethod : "POST";

    // For GET requests, convert body to query string params
    if (httpMethod === "GET" && fetchBody) {
      var qs: string[] = [];
      var bodyKeys = Object.keys(fetchBody);
      for (var ki = 0; ki < bodyKeys.length; ki++) {
        var bk = bodyKeys[ki];
        var bv = fetchBody[bk];
        if (bv !== null && bv !== undefined && typeof bv !== "object") {
          qs.push(encodeURIComponent(bk) + "=" + encodeURIComponent(String(bv)));
        }
      }
      if (qs.length > 0) {
        var sep = fetchUrl.indexOf("?") >= 0 ? "&" : "?";
        fetchUrl = fetchUrl + sep + qs.join("&");
      }
      fetchBody = null;
      delete fetchHd["Content-Type"];
    }

    addStep(steps, "Request", "ok", httpMethod + " " + fetchUrl + " | weight=" + totalWeight + "kg | destCep=" + destCep);

    // Execute
    var fetchStart = Date.now();
    var rawResponse: any = null;
    var rawText = "";

    var fetchOpts: any = {
      method: httpMethod,
      headers: fetchHd,
      signal: AbortSignal.timeout(20000),
    };
    if (httpMethod === "POST" && fetchBody) {
      fetchOpts.body = JSON.stringify(fetchBody);
    }

    try {
      var res = await fetch(fetchUrl, fetchOpts);
      var rawStatus = res.status;
      var rawStatusText = res.statusText;
      rawText = await res.text();
      var fMs = Date.now() - fetchStart;

      addStep(steps, "Resposta HTTP",
        rawStatus >= 200 && rawStatus < 300 ? "ok" : "error",
        rawStatus + " " + rawStatusText + " | " + rawText.length + " bytes | " + fMs + "ms",
        fMs
      );

      try {
        rawResponse = JSON.parse(rawText);
        addStep(steps, "Parse JSON", "ok", "Tipo raiz: " + (Array.isArray(rawResponse) ? "array" : typeof rawResponse));
      } catch (pe) {
        addStep(steps, "Parse JSON", "error", "Resposta nao e JSON valido: " + (pe as Error).message + ". Primeiros 500 chars: " + rawText.slice(0, 500));
        return { status: 200, body: {
          ok: false, steps: steps, parsedOptions: [], rawResponse: null, rawText: rawText.slice(0, 2000),
          timing: { totalMs: Date.now() - startTime, fetchMs: fMs },
        }};
      }
    } catch (fetchErr: any) {
      var fMs2 = Date.now() - fetchStart;
      addStep(steps, "Resposta HTTP", "error", "Erro de rede/timeout: " + (fetchErr.message || fetchErr), fMs2);
      return { status: 200, body: {
        ok: false, steps: steps, parsedOptions: [], rawResponse: null,
        timing: { totalMs: Date.now() - startTime, fetchMs: fMs2 },
      }};
    }

    // Parse options
    var rawOptions: any[] = [];

    if (provider === "melhor_envio") {
      if (Array.isArray(rawResponse)) rawOptions = rawResponse;
    } else if (provider === "frenet") {
      if (rawResponse && Array.isArray(rawResponse.ShippingSevicesArray)) rawOptions = rawResponse.ShippingSevicesArray;
    } else if (provider === "sisfrete") {
      // SisFrete response: { packages: [{ items: [...], quotations: [...] }] }
      var sfPackages = rawResponse && (rawResponse.packages || rawResponse.Packages);
      if (Array.isArray(sfPackages)) {
        for (var spi = 0; spi < sfPackages.length; spi++) {
          var sfPkg = sfPackages[spi];
          var sfQuots = sfPkg.quotations || sfPkg.Quotations || [];
          if (Array.isArray(sfQuots)) {
            for (var sqi = 0; sqi < sfQuots.length; sqi++) {
              rawOptions.push(sfQuots[sqi]);
            }
          }
          // Check items for errors
          var sfItems = sfPkg.items || [];
          for (var sii = 0; sii < sfItems.length; sii++) {
            var sfItem = sfItems[sii];
            if (sfItem.error_code && sfItem.error_code !== 0) {
              var errMsg = "error_code=" + sfItem.error_code;
              if (sfItem.error_code === 1) errMsg = errMsg + " (Qtd nao disponivel em estoque)";
              else if (sfItem.error_code === 2) errMsg = errMsg + " (CEP destino invalido)";
              else if (sfItem.error_code === 3) errMsg = errMsg + " (Produto nao disponivel para o CEP)";
              else if (sfItem.error_code === 4) errMsg = errMsg + " (Produto nao existe)";
              addStep(steps, "SisFrete Item Erro", "warn", "Item " + (sfItem.sku || sii) + ": " + errMsg);
            }
          }
        }
        addStep(steps, "Resolver Array", "ok", sfPackages.length + " pacote(s) SisFrete -> " + rawOptions.length + " cotacoes");
      } else {
        addStep(steps, "Resolver Array", "error", "Resposta SisFrete sem array 'packages'. Verifique o token e formato.");
      }
    } else {
      if (fm && fm.optionsPath) {
        var resolved = getField(rawResponse, fm.optionsPath);
        if (Array.isArray(resolved)) {
          rawOptions = resolved;
          addStep(steps, "Resolver Array", "ok", "Caminho \"" + fm.optionsPath + "\" -> " + resolved.length + " itens");
        } else {
          addStep(steps, "Resolver Array", "error", "Caminho \"" + fm.optionsPath + "\" nao retornou array. Valor: " + JSON.stringify(resolved).slice(0, 200));
        }
      } else if (fm && !fm.optionsPath && Array.isArray(rawResponse)) {
        rawOptions = rawResponse;
        addStep(steps, "Resolver Array", "ok", "Raiz e array com " + rawResponse.length + " itens");
      } else if (rawResponse && Array.isArray(rawResponse.options)) {
        rawOptions = rawResponse.options;
        addStep(steps, "Resolver Array", "ok", "Fallback: options -> " + rawResponse.options.length + " itens");
      } else if (Array.isArray(rawResponse)) {
        rawOptions = rawResponse;
        addStep(steps, "Resolver Array", "ok", "Fallback: raiz array -> " + rawResponse.length + " itens");
      } else {
        addStep(steps, "Resolver Array", "error", "Nenhum array encontrado na resposta. Configure o optionsPath no mapeamento.");
      }
    }

    addStep(steps, "Itens Brutos", rawOptions.length > 0 ? "ok" : "warn", rawOptions.length + " itens encontrados no array");

    var parsedOptions: any[] = [];
    var parseErrors: string[] = [];

    for (var idx = 0; idx < rawOptions.length; idx++) {
      var o = rawOptions[idx];

      if (fm && fm.errorField && getField(o, fm.errorField)) {
        parseErrors.push("Item " + idx + ": filtrado por erro \"" + fm.errorField + "\" = " + JSON.stringify(getField(o, fm.errorField)));
        continue;
      }
      if (provider === "melhor_envio" && o.error) {
        parseErrors.push("Item " + idx + " (" + (o.name || o.id) + "): " + JSON.stringify(o.error));
        continue;
      }
      if (provider === "frenet" && o.Error) {
        parseErrors.push("Item " + idx + " (" + (o.ServiceDescription || o.ServiceCode) + "): " + (o.Msg || o.Error));
        continue;
      }

      var nameVal: any, priceVal: any, daysVal: any, idVal: any;

      if (provider === "melhor_envio") {
        nameVal = ((o.company && o.company.name) || "Transportadora") + " - " + (o.name || "");
        priceVal = o.custom_price || o.price;
        daysVal = o.custom_delivery_time || o.delivery_time;
        idVal = "me_" + o.id;
      } else if (provider === "frenet") {
        nameVal = (o.Carrier || "Frete") + " - " + (o.ServiceDescription || "");
        priceVal = o.ShippingPrice;
        daysVal = o.DeliveryTime;
        idVal = "frenet_" + o.ServiceCode;
      } else if (provider === "sisfrete") {
        var sfTransp = o.transportadora || o.Transportadora || "";
        nameVal = sfTransp ? (sfTransp + " - " + (o.caption || o.Caption || "Frete")) : ("SisFrete - " + (o.caption || o.Caption || "Frete"));
        priceVal = o.price !== undefined ? o.price : o.cost;
        daysVal = o.promise || o.shipping_time || 0;
        idVal = "sisfrete_" + (o.service_id !== undefined ? o.service_id : idx);
      } else {
        nameVal = fm && fm.carrierName ? getField(o, fm.carrierName) : (o.carrierName || o.name);
        priceVal = fm && fm.price ? getField(o, fm.price) : o.price;
        daysVal = fm && fm.deliveryDays ? getField(o, fm.deliveryDays) : (o.deliveryDays || o.delivery_days);
        idVal = fm && fm.carrierId ? getField(o, fm.carrierId) : (o.carrierId || o.id);
      }

      var priceParsed = parseFloat(String(priceVal)) || 0;
      var daysParsed = parseInt(String(daysVal)) || 0;

      if (priceParsed === 0 && daysParsed === 0) {
        parseErrors.push("Item " + idx + ": preco=0 e prazo=0, filtrado. Raw: " + JSON.stringify(o).slice(0, 200));
        continue;
      }

      parsedOptions.push({
        carrierId: String(idVal || ("custom_" + idx)),
        carrierName: String(nameVal || "Frete"),
        price: priceParsed,
        deliveryDays: daysParsed,
        deliveryText: daysParsed ? ("ate " + daysParsed + " dias uteis") : "A consultar",
        source: "api",
      });
    }

    if (parseErrors.length > 0) {
      addStep(steps, "Itens Filtrados", "warn", parseErrors.length + " itens ignorados");
    }

    addStep(steps, "Resultado Final",
      parsedOptions.length > 0 ? "ok" : "error",
      parsedOptions.length + " opcoes de frete validas"
    );

    var calcMode = cfg.calcMode || "manual";
    if (calcMode !== "api" && calcMode !== "hybrid") {
      addStep(steps, "Modo de Calculo", "warn",
        "calcMode=\"" + calcMode + "\". A API externa so e usada em modo \"API Externa\" ou \"Hibrido\". Altere na aba Geral!"
      );
    } else {
      addStep(steps, "Modo de Calculo", "ok", "calcMode=\"" + calcMode + "\" - API externa sera usada no calculo");
    }

    var totalMs = Date.now() - startTime;
    var respSize = JSON.stringify(rawResponse).length;
    return { status: 200, body: {
      ok: parsedOptions.length > 0,
      steps: steps,
      parsedOptions: parsedOptions,
      rawOptionsCount: rawOptions.length,
      parseErrors: parseErrors,
      rawResponse: respSize < 50000 ? rawResponse : { _truncated: true, _size: respSize },
      requestMethod: httpMethod,
      requestUrl: fetchUrl,
      requestPayload: fetchBody,
      timing: { totalMs: totalMs },
      fieldMapping: fm || null,
    }};

  } catch (e: any) {
    console.log("Test shipping API error:", e);
    addStep(steps, "Erro Geral", "error", String(e.message || e));
    return { status: 200, body: {
      ok: false, steps: steps, parsedOptions: [], rawResponse: null,
      timing: { totalMs: Date.now() - startTime },
    }};
  }
}