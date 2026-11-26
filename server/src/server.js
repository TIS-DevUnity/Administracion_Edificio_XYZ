const app = require('./app')
const { iniciarCronsFinancieros } = require('./modules/financiero/jobs/scheduler')
const { marcarEnviosInterrumpidos } = require('./modules/operativo-seguridad/comunicados/comunicados.service')

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
  console.log(`Documentacion Swagger en http://localhost:${PORT}/api-docs`)

  // Un envio de comunicados que quedo a medias por un reinicio pasa a FALLIDO.
  marcarEnviosInterrumpidos()

  if (process.env.NODE_ENV !== 'test') {
    iniciarCronsFinancieros()
  }
})
