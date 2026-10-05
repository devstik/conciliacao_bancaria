const COMISSAO_ROLES = ["viewer"];

function canAccessComissao(user) {
  return COMISSAO_ROLES.includes(user?.role);
}

window.COMISSAO_ROLES = COMISSAO_ROLES;
window.canAccessComissao = canAccessComissao;
