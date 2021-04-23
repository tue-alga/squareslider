import * as PIXI from 'pixi.js';

import {World, Move} from './world';

type Position = [number, number];

class Color {
	static readonly GRAY = new Color(230, 230, 230);
	static readonly BLUE = new Color(68, 187, 248);
	static readonly RED = new Color(248, 78, 94);
	static readonly YELLOW = new Color(248, 230, 110);
	static readonly PURPLE = new Color(200, 90, 220);
	static readonly ORANGE = new Color(248, 160, 80);
	static readonly GREEN = new Color(140, 218, 90);

	constructor(public r: number, public g: number, public b: number) {
	}

	toHexColor(): number {
		return (this.r << 16) | (this.g << 8) | this.b;
	}

	equals(other: Color): boolean {
		return this.r === other.r &&
				this.g === other.g &&
				this.b === other.b;
	}
}

enum ComponentStatus {
	LINK_CUT, LINK_STABLE, CHUNK_CUT, CHUNK_STABLE, CONNECTOR, NONE
}

class Cube {
	p: Position;
	resetPosition: Position;
	color: Color;
	componentStatus: ComponentStatus;
	chunkId: number;
	onBoundary: boolean = false;
	pixi = new PIXI.Container();
	selectionCircle = new PIXI.Graphics();
	circle = new PIXI.Graphics();
	componentMark = new PIXI.Graphics();
	backgroundPixi = new PIXI.Graphics();
	//textPixi = new PIXI.Text('bla');
	dots: [number, PIXI.Graphics][] = [];
	dotsLayer = new PIXI.Container();
	selected: boolean = false;

	constructor(private world: World, p: [number, number], color: Color) {
		this.p = [p[0], p[1]];
		this.resetPosition = [p[0], p[1]];
		this.color = color;
		this.componentStatus = ComponentStatus.NONE;
		this.chunkId = -1;

		this.pixi.addChild(this.dotsLayer);
		this.pixi.addChild(this.selectionCircle);
		this.pixi.addChild(this.circle);
		this.pixi.addChild(this.componentMark);
		//this.pixi.addChild(this.textPixi);
		this.updatePixi();

		this.updatePosition(0, 0);
	}

	updatePixi(): void {
		this.selectionCircle.clear();
		this.selectionCircle.beginFill(0x2277bb);
		this.selectionCircle.moveTo(-50, -50);
		this.selectionCircle.lineTo(50, -50);
		this.selectionCircle.lineTo(50, 50);
		this.selectionCircle.lineTo(-50, 50);
		this.selectionCircle.closePath();
		this.selectionCircle.endFill();

		this.circle.clear();
		this.circle.beginFill(this.color.toHexColor());
		this.circle.lineStyle(6, 0x222222);
		this.circle.moveTo(-40, -40);
		this.circle.lineTo(40, -40);
		this.circle.lineTo(40, 40);
		this.circle.lineTo(-40, 40);
		this.circle.closePath();
		this.circle.endFill();

		this.componentMark.clear();
		switch (this.componentStatus) {
			case ComponentStatus.CONNECTOR:
				this.componentMark.lineStyle(6, 0x0066CB);
				this.componentMark.moveTo(-15, -15);
				this.componentMark.lineTo(15, -15);
				this.componentMark.lineTo(15, 15);
				this.componentMark.lineTo(-15, 15);
				this.componentMark.closePath();
				this.componentMark.moveTo(-15, -15);
				this.componentMark.lineTo(15, 15);
				this.componentMark.moveTo(15, -15);
				this.componentMark.lineTo(-15, 15);
				break;
			case ComponentStatus.CHUNK_STABLE:
				this.componentMark.beginFill(0x0066CB);
				this.componentMark.moveTo(-18, -18);
				this.componentMark.lineTo(18, -18);
				this.componentMark.lineTo(18, 18);
				this.componentMark.lineTo(-18, 18);
				this.componentMark.closePath();
				this.componentMark.endFill();
				break;
			case ComponentStatus.CHUNK_CUT:
				this.componentMark.lineStyle(6, 0x0066CB);
				this.componentMark.moveTo(-15, -15);
				this.componentMark.lineTo(15, -15);
				this.componentMark.lineTo(15, 15);
				this.componentMark.lineTo(-15, 15);
				this.componentMark.closePath();
				break;
			case ComponentStatus.LINK_STABLE:
				this.componentMark.beginFill(0xD5004A);
				this.componentMark.drawCircle(0, 0, 19);
				this.componentMark.endFill();
				break;
			case ComponentStatus.LINK_CUT:
				this.componentMark.lineStyle(6, 0xD5004A);
				this.componentMark.drawCircle(0, 0, 16);
				break;
		}

		this.backgroundPixi.clear();
		this.backgroundPixi.beginFill(0x000000);
		this.backgroundPixi.lineStyle(6, 0x000000);
		this.backgroundPixi.moveTo(40, -40);
		this.backgroundPixi.lineTo(50, -30);
		this.backgroundPixi.lineTo(50, 50);
		this.backgroundPixi.lineTo(-30, 50);
		this.backgroundPixi.lineTo(-40, 40);
		this.backgroundPixi.lineTo(-40, -40);
		this.backgroundPixi.closePath();
		this.backgroundPixi.endFill();

		/*this.textPixi.text = this.chunkId + '';
		this.textPixi.position.x = 80 * this.p[0];
		this.textPixi.position.y = -80 * this.p[1];*/
	}

	updatePosition(time: number, timeStep: number, move?: Move): void {
		let [x, y] = this.p;
		if (move) {
			[x, y] = move.interpolate(time - timeStep + 1);
		}

		this.circle.x = x * 80;
		this.circle.y = -y * 80;

		this.selectionCircle.visible = this.selected;
		this.selectionCircle.x = this.circle.x;
		this.selectionCircle.y = this.circle.y;

		this.componentMark.x = this.circle.x;
		this.componentMark.y = this.circle.y;

		this.backgroundPixi.x = this.circle.x;
		this.backgroundPixi.y = this.circle.y;
	}

	setColor(color: Color): void {
		this.color = color;
		this.updatePixi();
	}

	setComponentStatus(componentStatus: ComponentStatus): void {
		this.componentStatus = componentStatus;
		this.updatePixi();
	}

	setChunkId(chunkId: number): void {
		this.chunkId = chunkId;
		this.updatePixi();
	}

	nextColor(): void {
		if (this.color.equals(Color.GRAY)) {
			this.setColor(Color.BLUE);
		} else if (this.color.equals(Color.BLUE)) {
			this.setColor(Color.RED);
		} else if (this.color.equals(Color.RED)) {
			this.setColor(Color.YELLOW);
		} else if (this.color.equals(Color.YELLOW)) {
			this.setColor(Color.PURPLE);
		} else if (this.color.equals(Color.PURPLE)) {
			this.setColor(Color.ORANGE);
		} else if (this.color.equals(Color.ORANGE)) {
			this.setColor(Color.GREEN);
		} else {
			this.setColor(Color.GRAY);
		}
	}
}

export {Cube, Color, ComponentStatus, Position};

