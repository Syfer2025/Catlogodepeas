sige connection
Token SIGE válido
Token SIGE válido

baseUrl
https://carretao-api-7dbda52e1cca.herokuapp.com/api
expiresAt
2026-03-17T17:50:06.000Z
expiresInMinutes
222
isExpired
false

sige auth test
GET /user/me OK
GET /user/me OK


find test sku
SKU fornecido: "011066-318"
SKU fornecido: "011066-318"


kv sige map
sige_map_011066-318 encontrado
sige_map_011066-318 encontrado

data
{
  "sigeId": "011066",
  "descricao": "CATRACA DE FREIO TRACAO AUTOMATICA MBB AXOR 1633/2831/2544/3340/4140 L/E"
}
sigeId
011066
sigeIdType
string
sigeIdIsNumeric
true

product search
Esperado: API SIGE não aceita SKU hifenado "011066-318" em busca direta. SKU-spl
Esperado: API SIGE não aceita SKU hifenado "011066-318" em busca direta. SKU-split será usado.

httpStatus
400
rawResponse
(use verbose=1)
expectedBehavior
true

sku split search
SKU SPLIT FUNCIONA! "011066-318" → base="011066" encontrado, suffix="318" será u
SKU SPLIT FUNCIONA! "011066-318" → base="011066" encontrado, suffix="318" será usado como codRef

basePart
011066
suffix
318
product
{
  "codProduto": "011066",
  "descProdutoEst": "CATRACA DE FREIO TRACAO AUTOMATICA MBB AXOR 1633/2831/2544/3340/4140 L/E"
}
resolvedMapping
{
  "codProduto": "011066",
  "codRef": "318"
}
allProducts
1 resultados

reference direct 011066-318
Esperado: API não aceita SKU hifenado no path. GET /product/011066-318/reference
Esperado: API não aceita SKU hifenado no path. GET /product/011066-318/reference?codRef=318 → HTTP 400

httpStatus
400
rawResponsePreview
{"message":"Nenhum registro encontrado"}
refsFound
0
expectedBehavior
true

reference direct 011066
GET /product/011066/reference?codRef=318 -> 1 referencia(s) encontrada(s)!
GET /product/011066/reference?codRef=318 -> 1 referencia(s) encontrada(s)!

resolvedCodRef
318
activeRef
{
  "codRef": "318",
  "ean": "0000011066318",
  "status": "A",
  "pesoBruto": 3.7,
  "pesoLiquido": 3.7,
  "codProdFabricante": "816.3215-0",
  "controlaLote": "N",
  "composicao": "N",
  "dataCadastro": "2023-07-18T00:00:00.000Z",
  "observacao1": null,
  "observacao2": null,
  "ncm": "87083090",
  "comissionado": "S",
  "codGrupoComissionado": null,
  "dataAlteracao": "2025-03-19T14:50:52.853Z",
  "cest": null,
  "caminhoImagem1": null,
  "caminhoImagem2": null,
  "caminhoImagem3": null,
  "enviaEcommerce": "N"
}
suffixMatch
{
  "suffix": "318",
  "found": true
}
allRefs
[
  {
    "codRef": "318",
    "status": "A",
    "descricao": ""
  }
]
rawResponsePreview
(use verbose=1)

global reference endpoint
GET /reference?codProduto=011066-318 retornou 10 refs mas 10 NÃO pertencem ao pr
GET /reference?codProduto=011066-318 retornou 10 refs mas 10 NÃO pertencem ao produto!

totalReturned
10
matchingThisSku
0
nonMatchingOtherSkus
10
filtersCorrectly
false
sampleMatching
[]
sampleNonMatching
[
  {
    "codProduto": "000001",
    "codRef": "0"
  },
  {
    "codProduto": "000002",
    "codRef": "0"
  },
  {
    "codProduto": "000003",
    "codRef": "0"
  }
]
CRITICAL_ANALYSIS
CONFIRMA que a API ignora o filtro codProduto e retorna TODAS as refs. O filtro local no backend e ESSENCIAL.

price resolution
Preco encontrado: R$441.36
Preco encontrado: R$441.36

resolvedPrice
441.358
details
[
  {
    "source": "price_custom_",
    "found": false
  },
  {
    "source": "product_price_",
    "found": false
  },
  {
    "source": "sige_price_cache",
    "found": true,
    "value": {
      "sku": "011066-318",
      "found": true,
      "source": "sige",
      "sigeId": "011066",
      "descricao": "",
      "v1": 470.782,
      "v2": 441.358,
      "v3": 397.222,
      "v4": null,
      "v5": null,
      "base": 470.782,
      "tier": "v2",
      "price": 441.358,
      "showPrice": true,
      "_cachedAt": 1773756496910,
      "_priceListItems": 4,
      "_detectedListCodes": [],
      "_priceListDebug": [
        {
          "method": "direct_precoV",
          "matchedCodRef": "318",
          "skuRef": "318",
          "precoV1": 470.782,
          "precoV2": 441.358,
          "precoV3": 397.222,
          "precoV4": 0,
          "precoV5": 0
        }
      ],
      "_itemSampleKeys": [
        "codLista",
        "codProduto",
        "codRef",
        "precoV1",
        "precoV2",
        "precoV3",
        "precoV4",
        "precoV5",
        "qtdeMinVenda",
        "precoMinimo",
        "codMoeda",
        "dataVigor",
        "percMinimo"
      ],
      "_listMapping": {}
    }
  },
  {
    "source": "GET /product/011066-318 (direct)",
    "status": 404,
    "ok": false,
    "message": "Falhou: HTTP 404 - como esperado para SKUs nao-numericos"
  }
]

customer validation
codCliente não fornecido. Encontrado 5 mapeamento(s) no KV.
codCliente não fornecido. Encontrado 5 mapeamento(s) no KV.

sampleMapping
{
  "siteUserId": "d8c28cd3-8215-4622-8bcb-463e258deead",
  "sigeCustomerId": "60366",
  "sigeResponse": {
    "codCadastro": 60366,
    "tipoCadastro": "U",
    "codFilial": "001",
    "codArea": "000",
    "nomeCadastro": "MARIA SILVIA CORTEZ DA SILVA",
    "apelido": "MARIA SILVIA CORTEZ DA SILVA",
    "codReduzConta": "2007",
    "codReduzConta1": null,
    "tipoFJ": "F",
    "cpfCgc": "12777289921",
    "rgIe": "147880987",
    "uf": "PR",
    "dataCadastro": "2023-11-03T00:00:00.000Z",
    "dataAlteracao": "2023-12-20T09:07:27.400Z",
    "observacao": null,
    "codSituacao": "A",
    "codRamo": "0",
    "codReduzContaAd": null,
    "numV1": null,
    "numV2": null,
    "numV3": null,
    "numV4": null,
    "numV5": null,
    "numV6": null,
    "campoV1": null,
    "campoV2": "44 99804 9259",
    "campoV3": null,
    "campoV4": null,
    "campoV5": null,
    "campoV6": null,
    "codCategoria": null
  },
  "syncedAt": "2026-02-19T19:06:44.393Z",
  "profile": {
    "name": "Maria Silvia Cortez da Silva",
    "email": "mrs.cortezdasilva@gmail.com",
    "cpf": "12777289921"
  }
}
suggestion
Use ?codCliente=60366

resolveItemPrice test
✅ resolveItemPrice CORRIGIDO: busca via GET /product?codProduto= funciona (usand
✅ resolveItemPrice CORRIGIDO: busca via GET /product?codProduto= funciona (usando base "011066")

tests
[
  {
    "method": "GET /product/011066-318 (old approach)",
    "ok": false,
    "status": 404,
    "conclusion": "Falha como esperado - endpoint só aceita IDs numéricos"
  },
  {
    "method": "GET /product?codProduto=011066-318 (new search approach)",
    "ok": false,
    "status": 400,
    "productsFound": 0,
    "conclusion": "Nenhum produto encontrado para codProduto=\"011066-318\""
  },
  {
    "method": "GET /product?codProduto=011066 (new search approach)",
    "ok": true,
    "status": 200,
    "productsFound": 1,
    "conclusion": "Produto encontrado! resolveItemPrice pode buscar preço via busca"
  }
]
FIX_STATUS
CORRIGIDO - resolveItemPrice agora usa GET /product?codProduto= + SKU-split

dry run payload
1 problema(s) no payload
1 problema(s) no payload

issues
[
  "codCliFor é placeholder (12345) - não foi fornecido"
]
payload
{
  "codCliFor": 12345,
  "codTipoMv": "704",
  "items": [
    {
      "codProduto": "011066",
      "codRef": "318",
      "qtdeUnd": 1,
      "valorUnitario": 441.358
    }
  ]
}
resolvedCodRef
318
codRefSource
Resolvido da API SIGE
skuSplitUsed
{
  "base": "011066",
  "suffix": "318"
}