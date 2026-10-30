<?php 
  include "header.php"
?>

<main class="design-main">
  <section class="design-hero">
    <div class="container">
      <div class="row align-items-center">
        <div class="col-lg-2">
          <span class="badge">Grupo de Pesquisa</span>
          <h1 class="display-4 fw-bold">GEPISEG</h1>
          <p class="lead">A revolução dos bichos</p>
        </div>
      </div>
    </div>
  </section>
</main>

  <script src="js/dados.js"></script>
  <script src="js/gepiseg-api.js"></script>
  <script>
    const api = GepisegAPI.criar();

    async function mostrar() {
      const r = await api.artigos.listar();

      for (const artigo of r.results) {
        document.getElementById('lista').innerHTML +=
          '<h2>' + artigo.titulo + '</h2>';
      }
    }

    mostrar();
  </script>
</body>
</html>