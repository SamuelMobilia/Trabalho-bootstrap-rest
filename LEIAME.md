# GEPISEG — dados para as telas

12 pesquisadores e 30 artigos, com um JavaScript que funciona como se fosse uma API.

## Comece aqui

**Abra o `tutorial.html`** no navegador. Ele explica tudo passo a passo, com exemplos que rodam na própria página. Tem um botão para salvar em PDF.

Quer ver uma tela pronta funcionando? Abra o `exemplo.html`.

## Como está organizado

```
tutorial.html       <- comece por aqui
exemplo.html        tela funcionando: lista, busca, paginação, detalhe

js/
  dados.js          os dados
  gepiseg-api.js    o que você usa para buscar

json/
  pesquisadores.json      os 12, numa lista só
  artigos.json            os 30, numa lista só
  pesquisador/1.json      cada um também sozinho
  artigo/1.json           …até o 30
```

A `url` de um recurso **é o caminho do arquivo dele** — `"url": "json/artigo/7.json"`. Dá para abrir no navegador, e dá para seguir uma relação com `fetch` puro:

```js
const artigo = await (await fetch('json/artigo/7.json')).json();
const autor  = await (await fetch(artigo.autorPrincipal.url)).json();
```

Crie o seu HTML **na raiz**, ao lado das duas pastas.

## Em três linhas

```html
<script src="js/dados.js"></script>
<script src="js/gepiseg-api.js"></script>
<script>
  const api = GepisegAPI.criar();
  api.artigos.listar().then(r => console.log(r.results));
</script>
```

A ordem importa: `dados.js` antes de `gepiseg-api.js`.

Funciona abrindo o HTML com duplo clique. Não precisa de servidor.

---

Os pesquisadores e artigos são fictícios, criados para o exercício.
