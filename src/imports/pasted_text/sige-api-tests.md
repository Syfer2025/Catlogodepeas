sige connection
Token SIGE válido
Token SIGE válido

baseUrl
https://carretao-api-7dbda52e1cca.herokuapp.com/api
expiresAt
2026-03-17T17:50:06.000Z
expiresInMinutes
241
isExpired
false

sige auth test
GET /user/me OK
GET /user/me OK


find test sku
SKU fornecido: "007006-900"
SKU fornecido: "007006-900"


kv sige map
sige_map_007006-900 encontrado
sige_map_007006-900 encontrado

data
{
  "sigeId": "007006",
  "descricao": ""
}
sigeId
007006
sigeIdType
string
sigeIdIsNumeric
true

product search
Esperado: API SIGE não aceita SKU hifenado "007006-900" em busca direta. SKU-spl
Esperado: API SIGE não aceita SKU hifenado "007006-900" em busca direta. SKU-split será usado.

httpStatus
400
rawResponse
(use verbose=1)
expectedBehavior
true

sku split search
SKU SPLIT FUNCIONA! "007006-900" → base="007006" encontrado, suffix="900" será u
SKU SPLIT FUNCIONA! "007006-900" → base="007006" encontrado, suffix="900" será usado como codRef

basePart
007006
suffix
900
product
{
  "codProduto": "007006",
  "descProdutoEst": "PATIM DE FREIO 16.5X8 MASTER DC 332"
}
resolvedMapping
{
  "codProduto": "007006",
  "codRef": "900"
}
allProducts
1 resultados

reference direct 007006-900
Esperado: API não aceita SKU hifenado no path. GET /product/007006-900/reference
Esperado: API não aceita SKU hifenado no path. GET /product/007006-900/reference?codRef=900 → HTTP 400

httpStatus
400
rawResponsePreview
{"message":"Nenhum registro encontrado"}
refsFound
0
expectedBehavior
true

reference direct 007006
GET /product/007006/reference?codRef=900 -> 1 referencia(s) encontrada(s)!
GET /product/007006/reference?codRef=900 -> 1 referencia(s) encontrada(s)!

resolvedCodRef
900
activeRef
{
  "codRef": "900",
  "ean": "0000007006900",
  "status": "A",
  "pesoBruto": 6.2,
  "pesoLiquido": 6.2,
  "codProdFabricante": "007006/CA32",
  "controlaLote": "N",
  "composicao": "N",
  "dataCadastro": "2023-08-22T00:00:00.000Z",
  "observacao1": null,
  "observacao2": null,
  "ncm": "87169090",
  "comissionado": "S",
  "codGrupoComissionado": null,
  "dataAlteracao": "2025-04-02T20:41:55.480Z",
  "cest": null,
  "caminhoImagem1": null,
  "caminhoImagem2": null,
  "caminhoImagem3": null,
  "enviaEcommerce": "N"
}
suffixMatch
{
  "suffix": "900",
  "found": true
}
allRefs
[
  {
    "codRef": "900",
    "status": "A",
    "descricao": ""
  }
]
rawResponsePreview
(use verbose=1)

global reference endpoint
GET /reference?codProduto=007006-900 retornou 10 refs mas 10 NÃO pertencem ao pr
GET /reference?codProduto=007006-900 retornou 10 refs mas 10 NÃO pertencem ao produto!

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
Preco encontrado: R$115.70
Preco encontrado: R$115.70

resolvedPrice
115.7
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
      "sku": "007006-900",
      "found": true,
      "source": "sige",
      "sigeId": "007006",
      "descricao": "",
      "v1": 115.7,
      "v2": null,
      "v3": null,
      "base": 115.7,
      "tier": "v2",
      "price": 115.7,
      "showPrice": true,
      "_cachedAt": 1773753276056,
      "_priceListItems": 11,
      "_detectedListCodes": [
        "1"
      ],
      "_priceListDebug": [
        {
          "codLista": "1",
          "price": 115.7,
          "descLista": null
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
    "source": "GET /product/007006-900 (direct)",
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
✅ resolveItemPrice CORRIGIDO: busca via GET /product?codProduto= funciona (usando base "007006")

tests
[
  {
    "method": "GET /product/007006-900 (old approach)",
    "ok": false,
    "status": 404,
    "conclusion": "Falha como esperado - endpoint só aceita IDs numéricos"
  },
  {
    "method": "GET /product?codProduto=007006-900 (new search approach)",
    "ok": false,
    "status": 400,
    "productsFound": 0,
    "conclusion": "Nenhum produto encontrado para codProduto=\"007006-900\""
  },
  {
    "method": "GET /product?codProduto=007006 (new search approach)",
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
      "codProduto": "007006",
      "codRef": "900",
      "qtdeUnd": 1,
      "valorUnitario": 115.7
    }
  ]
}
resolvedCodRef
900
codRefSource
Resolvido da API SIGE
skuSplitUsed
{
  "base": "007006",
  "suffix": "900"
}