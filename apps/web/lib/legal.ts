// Datos del responsable del tratamiento. Los campos vacíos no se muestran en las páginas legales.
export const legal = {
  marca: "CONCAT",
  razonSocial: "", // ponytail: completar con la razón social registrada
  nit: "",
  domicilio: "Colombia",
  email: "lucas@onconcat.com",
  sitio: "https://onconcat.com",
  gateway: "https://gw.onconcat.com",
  vigencia: "3 de octubre de 2026",
  vigenciaISO: "2026-10-03",
}

export const responsable = legal.razonSocial
  ? `${legal.razonSocial}${legal.nit ? ` (NIT ${legal.nit})` : ""}, que opera bajo la marca ${legal.marca}`
  : legal.marca
