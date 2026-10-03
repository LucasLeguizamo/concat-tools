import { z } from "zod";
import { moduleIds } from "./modules/registry";

// Definiciones de las tools propias del gateway (siempre visibles). Las usan /mcp, el catalogo de docs y los evals.

export const gatewayStatusTool = {
  name: "gateway_status",
  title: "Estado del gateway",
  description: "Estado real de cada modulo (probe), ultimo chequeo, error y accion pendiente.",
  inputSchema: z.object({}),
};

export const gatewayConnectUrlTool = {
  name: "gateway_connect_url",
  title: "Enlace para conectar un modulo",
  description:
    "Devuelve el enlace para conectar o reconectar un modulo. Entregalo al usuario; nunca lo abras por tu cuenta.",
  inputSchema: z.object({
    module: z.string().min(1).max(32).describe(`Id del modulo: ${moduleIds().join(", ")}`),
  }),
};
