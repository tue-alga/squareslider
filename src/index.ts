import * as PIXI from 'pixi.js'
import {BBCS} from './bbcs'

let app = new PIXI.Application({
	antialias: true,
	backgroundColor: 0xfafafa,
	autoDensity: true
});
app.renderer.view.style.position = "absolute";
app.renderer.view.style.display = "block";
app.renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', (event: UIEvent) => {
	app.renderer.resize(window.innerWidth, window.innerHeight);
});
document.body.appendChild(app.view);

PIXI.Loader.shared.add([
	'icons/play.png',
	'icons/pause.png',
	'icons/select.png',
	'icons/delete.png',
	'icons/add-ball.png',
	'icons/add-wall.png'
]).load(() => {
	let bbcs = new BBCS(app);
});

