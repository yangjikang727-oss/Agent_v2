import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createPersistPlugin } from './stores/plugins/persistPlugin'

// 样式
import './styles/main.css'
import '@fortawesome/fontawesome-free/css/all.min.css'

const app = createApp(App)
const pinia = createPinia()

// 注册持久化插件
pinia.use(createPersistPlugin('agent3'))

app.use(pinia)
app.mount('#app')
