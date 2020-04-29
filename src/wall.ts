import * as PIXI from 'pixi.js';

import {World} from './world';

class Position {
	constructor (public x: number, public y: number) {
	}
}


class Wall {
	p: Position;
	pixi = new PIXI.Container();
	selectionLine = new PIXI.Graphics();
	line = new PIXI.Graphics();
	selected: boolean = false;

	constructor(private world: World, x: number, y: number, private positive:boolean) {
		this.p = new Position(x, y);

		this.pixi.x = x * 80;
		this.pixi.y = -y * 80;

		this.selectionLine.lineStyle(24, 0x2277bb);
		if (this.positive) {
			this.selectionLine.moveTo(0, 0);
			this.selectionLine.lineTo(80, -80);
		} else {
			this.selectionLine.moveTo(0, -80);
			this.selectionLine.lineTo(80, 0);
		}
		this.pixi.addChild(this.selectionLine);

		this.line.lineStyle(4, 0x222222);
		if (this.positive) {
			this.line.moveTo(0, 0);
			this.line.lineTo(80, -80);
		} else {
			this.line.moveTo(0, -80);
			this.line.lineTo(80, 0);
		}
		this.pixi.addChild(this.line);

		this.update(0, 0);
	}

	update(time: number, timeStep: number) {
		this.selectionLine.visible = this.selected;
	}
}

export {Wall};

