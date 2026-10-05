window.ComissaoScreens = window.ComissaoScreens || {};

window.ComissaoScreens["comissao-consolidado"] = {
  render() {
    byId("comissao-consolidado-screen").innerHTML = `
      <article class="table-wrap list-full-height receber-page">
        <div class="receber-header">
          <div class="receber-header-copy">
            <small>Comissões</small>
            <h3>Comissões Consolidadas</h3>
            <p>Resumo consolidado das comissões da operação.</p>
          </div>
        </div>
        <div class="receber-empty-state">
          <strong>Em construção</strong>
        </div>
      </article>
    `;
  }
};