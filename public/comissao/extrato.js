window.ComissaoScreens = window.ComissaoScreens || {};

window.ComissaoScreens["comissao-extrato"] = {
  render() {
    byId("comissao-extrato-screen").innerHTML = `
      <article class="table-wrap list-full-height receber-page">
        <div class="receber-header">
          <div class="receber-header-copy">
            <small>Comissões</small>
            <h3>Extrato de Comissão</h3>
            <p>Visão do extrato de comissão da operação.</p>
          </div>
        </div>
        <div class="receber-empty-state">
          <strong>Em construção</strong>
        </div>
      </article>
    `;
  }
};