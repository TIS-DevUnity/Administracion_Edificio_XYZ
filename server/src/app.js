require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const swaggerUi = require('swagger-ui-express')

const swaggerSpec = require('./config/swagger')
const { manejarErrores } = require('./middlewares/error.middleware')
const authRoutes = require('./modules/operativo-seguridad/auth/auth.routes')
const usuariosRoutes = require('./modules/operativo-seguridad/usuarios/usuarios.routes')
const copropietariosRoutes = require('./modules/operativo-seguridad/copropietarios/copropietarios.routes')
const inmueblesRoutes = require('./modules/operativo-seguridad/inmuebles/inmuebles.routes')
const tiposInmuebleRoutes = require('./modules/operativo-seguridad/tipos-inmueble/tipos-inmueble.routes')
const financieroTestAuthRoutes = require('./modules/financiero/test-auth/test-auth.routes')
const expensasRoutes = require('./modules/financiero/expensas/expensas.routes')

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/copropietarios', copropietariosRoutes)
app.use('/api/inmuebles', inmueblesRoutes)
app.use('/api/tipos-inmueble', tiposInmuebleRoutes)
app.use('/api/financiero', financieroTestAuthRoutes)
app.use('/api/financiero/expensas', expensasRoutes)

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))
app.use(manejarErrores)

module.exports = app
