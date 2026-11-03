import axios from "axios";
import { adaptadorSimulacion } from "@/lib/simulacion/adaptador";
import { enRutaSimulacion } from "@/lib/simulacion/almacen";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Dentro del entorno de simulación nada escribe en el sistema real (ver adaptador.ts).
    if (enRutaSimulacion()) config.adapter = adaptadorSimulacion;
  }
  return config;
});