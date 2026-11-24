import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')
if (app) {
  const title = document.createElement('h1')
  title.textContent = 'TINYARCADE'
  app.append(title)
}
