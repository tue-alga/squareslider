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

	toVector(): [number, number] {
		return [this.vx, this.vy];
	}
}

class Ball {
	p: Position;
	resetPosition: Position;
	d: Direction;
	resetDirection: Direction;
	pixi: PIXI.Graphics;

	constructor(private world: World, x: number, y: number, d: Direction) {
		this.p = new Position(x, y);
		this.resetPosition = new Position(x, y);
		this.d = d;
		this.resetDirection = d;

		this.pixi = new PIXI.Graphics();
		this.pixi.beginFill(0x44bbf8);
		this.pixi.lineStyle(4, 0x222222);
		this.pixi.drawCircle(0, 0, 40 * Math.SQRT2);
		this.pixi.endFill();

		this.update(0);
	}

	update(time: number) {
		let [vx, vy] = this.d.toVector();
		this.pixi.x = (this.p.x + time * vx) * 80;
		this.pixi.y = -(this.p.y + time * vy) * 80;
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
}

export {Direction, Ball};

