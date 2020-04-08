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

	private constructor(vx: number, vy: number) {
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

	toVector(): [number, number] {
		return [this.vx, this.vy];
	}
}

class Ball {
	p: Position;
	resetPosition: Position;
	d: Direction;
	resetDirection: Direction;
	pixi = new PIXI.Container();
	circle = new PIXI.Graphics();
	dots: [number, PIXI.Graphics][] = [];
	dotsLayer = new PIXI.Container();

	constructor(private world: World, x: number, y: number, d: Direction) {
		this.p = new Position(x, y);
		this.resetPosition = new Position(x, y);
		this.d = d;
		this.resetDirection = d;

		this.pixi.addChild(this.dotsLayer);

		this.circle.beginFill(0x44bbf8);
		this.circle.lineStyle(4, 0x222222);
		this.circle.drawCircle(0, 0, 40 * Math.SQRT2);
		this.circle.endFill();
		this.circle.beginFill(0x222222);
		this.circle.moveTo(75, 0);
		this.circle.lineTo(65, 10);
		this.circle.lineTo(65.57, 5);
		this.circle.lineTo(65.77, 0);
		this.circle.lineTo(65.57, -5);
		this.circle.lineTo(65, -10);
		this.circle.closePath();

		this.circle.endFill();
		this.pixi.addChild(this.circle);

		this.update(0, 0);
	}

	update(time: number, timeStep: number) {
		let [vx, vy] = this.d.toVector();
		this.circle.x = (this.p.x + (time - timeStep) * vx) * 80;
		this.circle.y = -(this.p.y + (time - timeStep) * vy) * 80;
		this.circle.rotation = -Math.atan2(this.d.vy, this.d.vx);

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

	handleWallCollisions(world: World): void {
		const [x, y] = [this.p.x, this.p.y];
		const [vx, vy] = [this.d.vx, this.d.vy];

		// positive-diagonal collisions
		if (world.hasWall([x, y - 1], [x + 1, y])
					&& vx >= 0 && vy <= 0) {
			this.d = this.d.bouncePositiveDiagonal();
		}
		if (world.hasWall([x - 1, y], [x, y + 1])
					&& vx <= 0 && vy >= 0) {
			this.d = this.d.bouncePositiveDiagonal();
		}

		// negative-diagonal collisions
		if (world.hasWall([x, y + 1], [x + 1, y])
					&& vx >= 0 && vy >= 0) {
			this.d = this.d.bounceNegativeDiagonal();
		}
		if (world.hasWall([x - 1, y], [x, y - 1])
					&& vx <= 0 && vy <= 0) {
			this.d = this.d.bounceNegativeDiagonal();
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
		dot.beginFill(0x44bbf8);
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

		// also need to update the position of the last dot
		if (this.dots.length > 0) {
			const dot = this.dots[this.dots.length - 1][1];
			dot.x = (this.p.x + this.d.vx / 2.0) * 80;
			dot.y = -(this.p.y + this.d.vy / 2.0) * 80;
		}
	}
}

export {Direction, Ball};

