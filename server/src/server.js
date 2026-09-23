const app = require('./app')
const { iniciarCronsFinancieros } = require('./modules/financiero/jobs/scheduler')

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
  console.log(`Documentacion Swagger en http://localhost:${PORT}/api-docs`)

  if (process.env.NODE_ENV !== 'test') {
    iniciarCronsFinancieros()
  }
})
