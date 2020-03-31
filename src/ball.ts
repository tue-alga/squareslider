import * as PIXI from 'pixi.js'

type Position = [number, number];

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

	applyTo([x, y]: Position): Position {
		return [x + this.vx, y + this.vy];
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
	x: number;
	y: number;
	d: Direction;
	g: PIXI.Graphics;

	constructor(field: PIXI.Container, x: number, y: number, d: Direction) {
		this.x = x;
		this.y = y;
		this.d = d;

		this.g = new PIXI.Graphics();
		this.g.beginFill(0xff0000);
		this.g.lineStyle(4, 0x444444);
		this.g.drawCircle(0, 0, 40 * Math.SQRT2);
		this.g.endFill();

		this.updatePosition(0);

		field.addChild(this.g);
	}

	updatePosition(time: number) {
		let [vx, vy] = this.d.toVector();
		this.g.x = (this.x + time * vx) * 80 + 40;
		this.g.y = -(this.y + time * vy) * 80 + 40;
	}

	handleCollisions(others: Ball[]): void {
		others.forEach((other) => {

			// horizontal / vertical collisions
			/*if (other.x === this.x
					&& other.y === this.y + 1
					&& this.d.vy >= 0 && this.d.vy <= 0) {
				this.d = this.d.bounceHorizontal();
				other.d = other.d.bounceHorizontal();
			}
			if (other.x === this.x + 1
					&& other.y === this.y
					&& this.d.vx >= 0 && this.d.vx <= 0) {
				this.d = this.d.bounceVertical();
				other.d = other.d.bounceVertical();
			}*/

			// diagonal collisions
			if (other.x === this.x + 1
					&& other.y === this.y - 1
					&& this.d.vx >= 0 && this.d.vy <= 0
					&& other.d.vx <= 0 && other.d.vy >= 0) {
				this.d = this.d.bouncePositiveDiagonal();
				other.d = other.d.bouncePositiveDiagonal();
			}
			if (other.x === this.x - 1
					&& other.y === this.y - 1
					&& this.d.vx <= 0 && this.d.vy <= 0
					&& other.d.vx >= 0 && other.d.vy >= 0) {
				this.d = this.d.bounceNegativeDiagonal();
				other.d = other.d.bounceNegativeDiagonal();
			}
		});
	}
}

export {Direction, Ball};

