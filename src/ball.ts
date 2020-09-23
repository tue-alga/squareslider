import * as PIXI from 'pixi.js';

import {World} from './world';

class Position {
	constructor (public x: number, public y: number) {
	}
}

/**
 * The direction a ball is moving towards.
 */
class Direction {
	static readonly UP = new Direction(0, 1);
	static readonly RIGHT = new Direction(1, 0);
	static readonly DOWN = new Direction(0, -1);
	static readonly LEFT = new Direction(-1, 0);

	vx: number;
	vy: number;

	constructor(vx: number, vy: number) {
		this.vx = vx;
		this.vy = vy;
	}

	applyTo(p: Position): Position {
		return new Position(p.x + this.vx, p.y + this.vy);
	}

	bounceHorizontal(): Direction {
		return new Direction(this.vx, -this.vy);
	}

	bounceVertical(): Direction {
		return new Direction(-this.vx, this.vy);
	}

	bouncePositiveDiagonal(): Direction {
		return new Direction(this.vy, this.vx);
	}

	bounceNegativeDiagonal(): Direction {
		return new Direction(-this.vy, -this.vx);
	}

	rotateClockwise(): Direction {
		if (this.vy === 0) {
			return new Direction(0, -this.vx);
		} else {
			return new Direction(this.vy, 0);
		}
	}

	rotateCounterClockwise(): Direction {
		if (this.vy === 0) {
			return new Direction(0, this.vx);
		} else {
			return new Direction(-this.vy, 0);
		}
	}

	toVector(): [number, number] {
		return [this.vx, this.vy];
	}
}

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
	d: Direction;
	resetDirection: Direction;
	color: Color;
	pixi = new PIXI.Container();
	selectionCircle = new PIXI.Graphics();
	circle = new PIXI.Graphics();
	dots: [number, PIXI.Graphics][] = [];
	dotsLayer = new PIXI.Container();
	selected: boolean = false;

	constructor(private world: World, x: number, y: number, d: Direction, color: Color) {
		this.p = new Position(x, y);
		this.resetPosition = new Position(x, y);
		this.d = d;
		this.resetDirection = d;
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

	updatePosition(time: number, timeStep: number): void {
		let [vx, vy] = this.d.toVector();
		this.circle.x = (this.p.x + (time - timeStep) * vx) * 80;
		this.circle.y = -(this.p.y + (time - timeStep) * vy) * 80;
		this.circle.rotation = -Math.atan2(this.d.vy, this.d.vx);

		this.selectionCircle.visible = this.selected;
		this.selectionCircle.x = this.circle.x;
		this.selectionCircle.y = this.circle.y;

		if (this.dots.length > 0) {
			while (time - this.dots[0][0] > 8) {
				this.dotsLayer.removeChild(this.dots[0][1]);
				this.dots = this.dots.slice(1);
			}
			if (time - this.dots[0][0] > 7.5) {
				const scaleFactor = 1 - 2 * (time - this.dots[0][0] - 7.5);
				this.dots[0][1].scale.set(scaleFactor);
			}
		}
	}

	handleBallCollisions(world: World): void {
		const [x, y] = [this.p.x, this.p.y];
		const [vx, vy] = [this.d.vx, this.d.vy];

		// note: this handles collisions with balls with lower y-coordinate
		// only; this is still correct because collisions with balls with
		// higher y-coordinate will be handled by the other ball

		// positive-diagonal collisions
		if (vx >= 0 && vy <= 0) {
			let other = world.getBall(x + 1, y - 1);
			if (other && other.d.vx <= 0 && other.d.vy >= 0) {
				this.d = this.d.bouncePositiveDiagonal();
				other.d = other.d.bouncePositiveDiagonal();
			}
		}

		// negative-diagonal collisions
		if (vx <= 0 && vy <= 0) {
			let other = world.getBall(x - 1, y - 1);
			if (other && other.d.vx >= 0 && other.d.vy >= 0) {
				this.d = this.d.bounceNegativeDiagonal();
				other.d = other.d.bounceNegativeDiagonal();
			}
		}
	}

	placeDots(time: number): void {
		const dot = new PIXI.Graphics();
		dot.beginFill(this.color.toHexColor());
		dot.drawCircle(0, 0, 5 * Math.SQRT2);
		dot.x = this.p.x * 80;
		dot.y = -this.p.y * 80;
		dot.endFill();
		this.dotsLayer.addChild(dot);
		this.dots.push([time, dot]);

		const dot2 = new PIXI.Graphics(dot.geometry);
		dot2.x = (this.p.x + this.d.vx / 2.0) * 80;
		dot2.y = -(this.p.y + this.d.vy / 2.0) * 80;
		this.dotsLayer.addChild(dot2);
		this.dots.push([time + 0.5, dot2]);
	}

	rotateClockwise(): void {
		this.d = this.d.rotateClockwise();
		this.resetDirection = this.d;
		this.updateLastDot();
	}

	rotateCounterClockwise(): void {
		this.d = this.d.rotateCounterClockwise();
		this.resetDirection = this.d;
		this.updateLastDot();
	}

	updateLastDot(): void {
		if (this.dots.length > 0) {
			const dot = this.dots[this.dots.length - 1][1];
			dot.x = (this.p.x + this.d.vx / 2.0) * 80;
			dot.y = -(this.p.y + this.d.vy / 2.0) * 80;
		}
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

export {Direction, Ball, Color};

