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

class Ball {
	p: Position;
	resetPosition: Position;
	color: Color;
	pixi = new PIXI.Container();
	selectionCircle = new PIXI.Graphics();
	circle = new PIXI.Graphics();
	dots: [number, PIXI.Graphics][] = [];
	dotsLayer = new PIXI.Container();
	selected: boolean = false;

	constructor(private world: World, x: number, y: number, color: Color) {
		this.p = [x, y];
		this.resetPosition = [x, y];
		this.color = color;

		this.pixi.addChild(this.dotsLayer);
		this.pixi.addChild(this.selectionCircle);
		this.pixi.addChild(this.circle);
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
		this.circle.lineStyle(4, 0x222222);
		this.circle.moveTo(-40, -40);
		this.circle.lineTo(40, -40);
		this.circle.lineTo(40, 40);
		this.circle.lineTo(-40, 40);
		this.circle.closePath();
		this.circle.endFill();
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
	}

	setColor(color: Color): void {
		this.color = color;
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

export {Ball, Color, Position};

