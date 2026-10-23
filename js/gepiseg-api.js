/**
 * GEPISEG — cliente de dados para as telas.
 *
 * O contrato segue a Rick and Morty API: listagem devolve `{ info, results }`,
 * recurso unico devolve o objeto cru, relacao viaja como caminho de arquivo,
 * e erro devolve
 * `{ error: "..." }` com status 404.
 *
 * REGRA DESTE ARQUIVO: ele nao transforma dado.
 * O que esta em `artigos.json` e `pesquisadores.json` JA E a resposta — campo
 * por campo, do jeito que sai. Aqui so acontecem tres coisas: filtrar, recortar
 * a pagina e montar o bloco `info`. Nenhum campo e renomeado, calculado ou
 * acrescentado no caminho. Entao o que voce inspeciona no JSON e exatamente o
 * que chega na sua tela.
 *
 * COMO USAR
 *
 *   <script src="js/dados.js"></script>
 *   <script src="js/gepiseg-api.js"></script>
 *   <script>
 *     const api = GepisegAPI.criar();
 *
 *     api.artigos.listar({ q: 'phishing' }).then(function (r) {
 *       console.log(r.info);      // { count, pages, next, prev }
 *       console.log(r.results);   // os artigos
 *     });
 *   </script>
 *
 * Para ler a pasta json/ em vez do dados.js (precisa de servidor local):
 *
 *   const api = await GepisegAPI.carregar();
 */

(function (global) {
  'use strict';

  /* ================================================================
   * Erro — mesmo formato da referencia: { error: "mensagem" }
   * ================================================================ */

  function ErroApi(status, mensagem) {
    const e = new Error(mensagem);
    e.name = 'ErroApi';
    e.status = status;
    e.corpo = { error: mensagem };
    return e;
  }

  /** Usado quando o filtro nao casa com nada. Na referencia isso e 404, nao 200 com lista vazia. */
  const NADA_AQUI = 'Não há nada aqui';

  /* ================================================================
   * Utilitarios
   * ================================================================ */

  /**
   * Comparacao sem acento e sem caixa.
   *
   * Sem isso, procurar "seguranca" nao acha "segurança" — e o aluno digita das
   * duas formas. A normalizacao NFD separa a letra do acento; o replace tira
   * so os acentos.
   */
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function contem(texto, alvo) {
    return normalizar(texto).indexOf(normalizar(alvo)) !== -1;
  }

  /**
   * Copia defensiva. Nao muda a forma do objeto — so impede que a tela altere
   * sem querer a base de dados compartilhada.
   */
  function copiar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /** Lista de valores distintos, ordenada — serve para montar <select>. */
  function distintos(lista, pegar) {
    const vistos = Object.create(null);
    lista.forEach(function (item) {
      const v = pegar(item);
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        if (x !== null && x !== undefined && x !== '') vistos[x] = true;
      });
    });
    return Object.keys(vistos).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR');
    });
  }

  /**
   * Tira o id numérico de uma referência.
   *
   *   "json/pesquisador/7.json"  ->  7
   *   7                          ->  7
   *
   * Existe porque a referência entre recursos é o caminho do arquivo, e a tela
   * às vezes filtra pelo id solto (`{ pesquisador: 7 }`), às vezes pela
   * referência inteira que acabou de ler do dado. As duas formas têm que valer.
   */
  function idDaRef(ref) {
    if (ref && typeof ref === 'object' && ref.url) ref = ref.url;
    const ultimo = String(ref).split('/').pop();
    const n = parseInt(ultimo, 10);
    return isNaN(n) ? null : n;
  }

  /** Monta a query string de `next`/`prev` preservando os filtros em uso. */
  function queryDe(filtros, pagina) {
    const partes = ['page=' + pagina];
    Object.keys(filtros).forEach(function (chave) {
      if (chave === 'page' || chave === 'pagina' || chave === 'porPagina') return;
      const v = filtros[chave];
      if (v === undefined || v === null || v === '') return;
      partes.push(encodeURIComponent(chave) + '=' + encodeURIComponent(v));
    });
    return '?' + partes.join('&');
  }

  /* ================================================================
   * Ordenacoes
   * ================================================================ */

  const ORDENS_ARTIGO = {
    recentes: function (a, b) { return b.dataLancamento.localeCompare(a.dataLancamento); },
    antigos: function (a, b) { return a.dataLancamento.localeCompare(b.dataLancamento); },
    citacoes: function (a, b) { return b.citacoes - a.citacoes; },
    titulo: function (a, b) { return a.titulo.localeCompare(b.titulo, 'pt-BR'); },
  };

  const ORDENS_PESQUISADOR = {
    nome: function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); },
    artigos: function (a, b) { return b.metricas.totalArtigos - a.metricas.totalArtigos; },
    citacoes: function (a, b) { return b.metricas.totalCitacoes - a.metricas.totalCitacoes; },
  };

  /* ================================================================
   * Filtros
   * ================================================================ */

  function filtrarArtigos(artigos, f) {
    let r = artigos.slice();

    // Busca livre: titulo, resumo, tema, veiculo, palavra-chave e nome de autor.
    if (f.q) {
      r = r.filter(function (a) {
        return (
          contem(a.titulo, f.q) ||
          contem(a.resumo, f.q) ||
          contem(a.tema, f.q) ||
          contem(a.veiculo, f.q) ||
          a.palavrasChave.some(function (p) { return contem(p, f.q); }) ||
          a.autores.some(function (p) { return contem(p.nome, f.q); })
        );
      });
    }

    // Aceita o id solto (7) ou a referência inteira ("json/pesquisador/7.json").
    if (f.pesquisador !== undefined && f.pesquisador !== '') {
      const alvo = idDaRef(f.pesquisador);
      r = r.filter(function (a) {
        return a.pesquisadores.some(function (ref) { return idDaRef(ref) === alvo; });
      });
    }

    if (f.autorPrincipal !== undefined && f.autorPrincipal !== '') {
      const alvo = idDaRef(f.autorPrincipal);
      r = r.filter(function (a) { return idDaRef(a.autorPrincipal.url) === alvo; });
    }

    if (f.tema) r = r.filter(function (a) { return contem(a.tema, f.tema); });
    if (f.veiculo) r = r.filter(function (a) { return contem(a.veiculo, f.veiculo); });
    if (f.tipo) r = r.filter(function (a) { return a.tipo === f.tipo; });
    if (f.status) r = r.filter(function (a) { return a.status === f.status; });

    if (f.palavraChave) {
      r = r.filter(function (a) {
        return a.palavrasChave.some(function (p) { return contem(p, f.palavraChave); });
      });
    }

    if (f.ano) {
      const ano = parseInt(f.ano, 10);
      r = r.filter(function (a) { return a.ano === ano; });
    }
    // Comparar string funciona porque YYYY-MM-DD ordena igual a data.
    if (f.de) r = r.filter(function (a) { return a.dataLancamento >= f.de; });
    if (f.ate) r = r.filter(function (a) { return a.dataLancamento <= f.ate; });

    if (f.citacoesMinimas) {
      const min = parseInt(f.citacoesMinimas, 10);
      r = r.filter(function (a) { return a.citacoes >= min; });
    }

    r.sort(ORDENS_ARTIGO[f.ordenar] || ORDENS_ARTIGO.recentes);
    return r;
  }

  function filtrarPesquisadores(pesquisadores, f) {
    let r = pesquisadores.slice();

    if (f.q) {
      r = r.filter(function (p) {
        return (
          contem(p.nome, f.q) ||
          contem(p.bio, f.q) ||
          contem(p.linhaPesquisa, f.q) ||
          p.areas.some(function (a) { return contem(a, f.q); })
        );
      });
    }

    if (f.nome) r = r.filter(function (p) { return contem(p.nome, f.nome); });
    if (f.area) {
      r = r.filter(function (p) {
        return p.areas.some(function (a) { return contem(a, f.area); });
      });
    }
    if (f.titulacao) r = r.filter(function (p) { return contem(p.titulacao, f.titulacao); });
    if (f.ativo !== undefined) r = r.filter(function (p) { return p.ativo === f.ativo; });

    r.sort(ORDENS_PESQUISADOR[f.ordenar] || ORDENS_PESQUISADOR.nome);
    return r;
  }

  /* ================================================================
   * Fabrica
   * ================================================================ */

  /**
   * @param {object} [opcoes]
   * @param {object} [opcoes.dados]     { base, pesquisadores, artigos }. Omitido, usa window.GEPISEG_DADOS.
   * @param {number} [opcoes.atrasoMs] Atraso artificial por chamada. Default 120.
   *        Serve para a tela precisar de estado de carregando — com resposta
   *        instantanea e facil esquecer, e a tela quebra contra uma API real.
   *        Coloque 0 enquanto estiver depurando.
   */
  function criar(opcoes) {
    opcoes = opcoes || {};

    const base = opcoes.dados || global.GEPISEG_DADOS;
    if (!base || !base.pesquisadores || !base.artigos) {
      throw new Error(
        'Dados não encontrados. Inclua <script src="dados.js"></script> antes ' +
          'deste arquivo, ou use GepisegAPI.carregar().',
      );
    }

    const atraso = opcoes.atrasoMs === undefined ? 120 : opcoes.atrasoMs;

    /*
     * Arquivo de cada coleção. É para onde `info.next` e `info.prev` apontam.
     *
     * A referência entre recursos é o caminho do arquivo — `json/artigo/7.json`
     * —, então o link de página segue a mesma ideia: aponta para o arquivo que
     * existe, com os filtros na query. O arquivo em si não é paginado; quem lê
     * a query é este cliente.
     */
    const ARQUIVO_COLECAO = {
      pesquisador: 'json/pesquisadores.json',
      artigo: 'json/artigos.json',
    };
    const PESQUISADORES = base.pesquisadores;
    const ARTIGOS = base.artigos;

    function responder(valor) {
      return new Promise(function (resolve) {
        if (atraso > 0) setTimeout(function () { resolve(valor); }, atraso);
        else resolve(valor);
      });
    }

    function recusar(erro) {
      return new Promise(function (_resolve, reject) {
        if (atraso > 0) setTimeout(function () { reject(erro); }, atraso);
        else reject(erro);
      });
    }

    /**
     * Recorta a pagina e monta o `info`. E a unica coisa que este arquivo
     * produz que nao estava no JSON — e so porque pagina nao da para vir
     * pre-calculada: ela depende dos filtros que a tela escolheu.
     */
    function envelopar(recurso, achados, filtros) {
      const porPagina = Math.min(100, Math.max(1, parseInt(filtros.porPagina, 10) || 12));
      const paginas = Math.max(1, Math.ceil(achados.length / porPagina));
      const pagina = Math.min(paginas, Math.max(1, parseInt(filtros.pagina || filtros.page, 10) || 1));
      const inicio = (pagina - 1) * porPagina;

      return {
        info: {
          count: achados.length,
          pages: paginas,
          next: pagina < paginas
            ? ARQUIVO_COLECAO[recurso] + queryDe(filtros, pagina + 1)
            : null,
          prev: pagina > 1
            ? ARQUIVO_COLECAO[recurso] + queryDe(filtros, pagina - 1)
            : null,
        },
        results: copiar(achados.slice(inicio, inicio + porPagina)),
      };
    }

    /** Aceita id (7), referência inteira, ou "1,2,3". Devolve a lista de ids. */
    function idsDe(entrada) {
      const bruto = Array.isArray(entrada) ? entrada : String(entrada).split(',');
      return bruto.map(function (x) { return idDaRef(String(x).trim()); });
    }

    function buscarUm(colecao, id) {
      return colecao.find(function (r) { return r.id === id; });
    }

    /**
     * Um ou varios recursos por id.
     * Como na referencia: um id devolve o objeto, varios devolvem array, e id
     * inexistente e 404 — nao `undefined` nem lista vazia.
     */
    function porId(colecao, entrada, nomeRecurso) {
      const ids = idsDe(entrada);

      if (ids.some(function (n) { return n === null; })) {
        return recusar(ErroApi(404, nomeRecurso + ' não encontrado'));
      }

      const achados = ids.map(function (id) { return buscarUm(colecao, id); });
      if (achados.some(function (a) { return !a; })) {
        return recusar(ErroApi(404, nomeRecurso + ' não encontrado'));
      }

      return responder(ids.length === 1 ? copiar(achados[0]) : copiar(achados));
    }

    function listar(colecao, filtrar, recurso, filtros) {
      filtros = filtros || {};
      const achados = filtrar(colecao, filtros);
      if (achados.length === 0) return recusar(ErroApi(404, NADA_AQUI));
      return responder(envelopar(recurso, achados, filtros));
    }

    return {
      pesquisadores: {
        listar: function (filtros) {
          return listar(PESQUISADORES, filtrarPesquisadores, 'pesquisador', filtros);
        },
        porId: function (entrada) {
          return porId(PESQUISADORES, entrada, 'Pesquisador');
        },
      },

      artigos: {
        listar: function (filtros) {
          return listar(ARTIGOS, filtrarArtigos, 'artigo', filtros);
        },
        porId: function (entrada) {
          return porId(ARTIGOS, entrada, 'Artigo');
        },
      },

      /**
       * Resolve qualquer URL de relação para o recurso inteiro.
       *
       * Com relação em URL, a tela lê `artigo.pesquisadores[0]` e precisa
       * transformar aquilo num objeto. É o mesmo passo que você daria contra a
       * API real — aqui ele é local, mas a chamada da tela é idêntica.
       *
       *   api.seguir(artigo.autorPrincipal.url).then(mostrarAutor);
       *   api.seguir(pesquisador.artigos).then(mostrarLista);   // aceita lista
       */
      seguir: function seguir(ref) {
        // Nomeada de propósito: `const { seguir } = api` continua funcionando.
        // Com `this.seguir` aqui, destruturar quebraria a recursão da lista.
        if (Array.isArray(ref)) {
          return Promise.all(ref.map(function (r) { return seguir(r); }));
        }

        // Aceita a referência solta ou o objeto que a carrega — `artigo.autores`
        // e `pessoa.artigos` vêm como { nome, url } e { titulo, url }, e exigir
        // que a tela escreva `.url` toda vez seria atrito sem motivo.
        if (ref && typeof ref === 'object' && ref.url) ref = ref.url;

        // "json/pesquisador/7.json" -> tipo "pesquisador", id 7
        const partes = String(ref).split('/');
        const id = idDaRef(partes.pop());
        const tipo = partes.pop();

        if (tipo === 'artigo') return porId(ARTIGOS, id, 'Artigo');
        if (tipo === 'pesquisador') return porId(PESQUISADORES, id, 'Pesquisador');
        return recusar(ErroApi(404, 'Recurso não encontrado'));
      },

      /**
       * Valores distintos para montar os filtros da tela. Não é um recurso da
       * referência — é um atalho para não chumbar as opções no HTML e deixá-las
       * desatualizadas quando o dado mudar.
       */
      filtros: function () {
        return responder({
          temas: distintos(ARTIGOS, function (a) { return a.tema; }),
          veiculos: distintos(ARTIGOS, function (a) { return a.veiculo; }),
          tipos: distintos(ARTIGOS, function (a) { return a.tipo; }),
          palavrasChave: distintos(ARTIGOS, function (a) { return a.palavrasChave; }),
          anos: distintos(ARTIGOS, function (a) { return String(a.ano); }).sort().reverse(),
          areas: distintos(PESQUISADORES, function (p) { return p.areas; }),
          titulacoes: distintos(PESQUISADORES, function (p) { return p.titulacao; }),
        });
      },
    };
  }

  /**
   * Versão que busca os .json em vez de usar o dados.js.
   * Precisa de servidor local (`npx serve`): o navegador bloqueia fetch de
   * arquivo aberto com duplo clique.
   */
  function carregar(raiz, opcoes) {
    // Padrao 'json/': e onde os arquivos ficam no pacote entregue.
    const dir = (raiz || 'json/').replace(/\/?$/, '/');
    return Promise.all([
      fetch(dir + 'pesquisadores.json').then(function (r) { return r.json(); }),
      fetch(dir + 'artigos.json').then(function (r) { return r.json(); }),
    ]).then(function (partes) {
      return criar(
        Object.assign({}, opcoes, {
          dados: { pesquisadores: partes[0], artigos: partes[1] },
        }),
      );
    });
  }

  global.GepisegAPI = { criar: criar, carregar: carregar };

  // Também funciona com require() no Node, para testar fora do navegador.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.GepisegAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
