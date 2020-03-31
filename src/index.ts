import * as PIXI from 'pixi.js'
import {BBCS} from './bbcs'

// do the actual loading
let app = new PIXI.Application({
	antialias: true,
	backgroundColor: 0xffffff,
	autoDensity: true
});
app.renderer.view.style.position = "absolute";
app.renderer.view.style.display = "block";
app.renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', (event: UIEvent) => {
	app.renderer.resize(window.innerWidth, window.innerHeight);
});
document.body.appendChild(app.view);
let bbcs = new BBCS(app);

