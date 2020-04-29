import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Ball, Direction} from './ball';
import {Wall} from './wall';

type WorldCell = {
	ball: Ball | null;
	positiveWall: Wall | null;
	negativeWall: Wall | null;
};

/**
 * Collection of balls and walls on the grid.
 */
class World {

	world: WorldCell[][] = [];

	viewport = new Viewport();
	pixi = new PIXI.Container();
	grid: PIXI.Graphics;
	wallGrid: PIXI.Graphics;

	balls: Ball[] = [];
	walls: Wall[] = [];

	constructor() {
		this.viewport.addChild(this.pixi);

		this.viewport.drag();
		this.viewport.pinch();
		this.viewport.wheel();
		this.viewport.clampZoom({
			"minScale": 0.1,
			"maxScale": 2,
		});
		this.viewport.zoomPercent(-0.5, true);

		this.pixi.rotation = -Math.PI / 4;

		// grid lines (TODO do this in a shader)
		this.grid = new PIXI.Graphics();
		this.grid.lineStyle(3, 0xdddddd);
		for (let x = -4000; x <= 4000; x += 80) {
			this.grid.moveTo(x, -4000);
			this.grid.lineTo(x, 4000);
			this.grid.moveTo(-4000, x);
			this.grid.lineTo(4000, x);
		}
		this.pixi.addChild(this.grid);

		this.wallGrid = new PIXI.Graphics();
		this.wallGrid.lineStyle(3, 0xdddddd);
		for (let x = -4000; x <= 4000; x += 80) {
			this.wallGrid.moveTo(x - 4000, -x - 4000);
			this.wallGrid.lineTo(x + 4000, -x + 4000);
			this.wallGrid.moveTo(-x - 4000, -x + 4000);
			this.wallGrid.lineTo(-x + 4000, -x - 4000);
		}
		this.pixi.addChild(this.wallGrid);
		this.wallGrid.visible = false;
	}

	private getColumn(x: number): WorldCell[] {
		if (!this.world[x]) {
			this.world[x] = [];
		}
		return this.world[x];
	}

	private getCell(x: number, y: number): WorldCell {
		let column = this.getColumn(x);
		if (!column[y]) {
			column[y] = {
				ball: null,
				positiveWall: null,
				negativeWall: null,
			};
		}
		return column[y];
	}

	private checkWallCoords(from: [number, number], to: [number, number]):
			[number, number, number, number] {
		const [x1, y1] = from;
		const [x2, y2] = to;
		if (Math.abs(x2 - x1) !== 1 || Math.abs(y2 - y1) !== 1) {
			throw `Illegal wall check from (${x1}, ${y1}) to (${y1}, ${y2}) ` +
					`(should be diagonal, one apart)`;
		}

		return [x1, y1, x2, y2];
	}

	getWall(from: [number, number], to: [number, number]): Wall | null {
		const [x1, y1, x2, y2] = this.checkWallCoords(from, to);
		const [x3, y3] = [Math.min(x1, x2), Math.min(y1, y2)];
		let hasWall: boolean;
		if ((x3 === x1 && y3 === y1) || (x3 === x2 && y3 === y2)) {
			return this.getCell(x3, y3).positiveWall;
		} else {
			return this.getCell(x3, y3).negativeWall;
		}
	}

	hasWall(from: [number, number], to: [number, number]): boolean {
		return !!this.getWall(from, to);
	}

	addWall(from: [number, number], to: [number, number]): Wall {
		const [x1, y1, x2, y2] = this.checkWallCoords(from, to);
		const [x3, y3] = [Math.min(x1, x2), Math.min(y1, y2)];
		let wallIsPositive = (x3 === x1 && y3 === y1) || (x3 === x2 && y3 === y2);
		let wall = new Wall(this, x3, y3, wallIsPositive);
		if (wallIsPositive) {
			this.getCell(x3, y3).positiveWall = wall;
		} else {
			this.getCell(x3, y3).negativeWall = wall;
		}
		this.walls.push(wall);
		this.pixi.addChild(wall.pixi);
		return wall;
	}

	removeWall(wall: Wall): void {
		this.pixi.removeChild(wall.pixi);
		if (wall.positive) {
			this.getCell(wall.p.x, wall.p.y).positiveWall = null;
		} else {
			this.getCell(wall.p.x, wall.p.y).negativeWall = null;
		}
		this.walls = this.walls.filter((w) => w !== wall);
	}

	getBall(x: number, y: number): Ball | null {
		return this.getCell(x, y).ball;
	}

	hasBall(x: number, y: number): boolean {
		return !!this.getBall(x, y);
	}

	addBall(x: number, y: number, d: Direction): Ball {
		if (this.getBall(x, y)) {
			throw `Tried to insert ball on top of another ball ` +
					`at (${x}, ${y})`;
		}
		const ball = new Ball(this, x, y, d);
		this.getCell(x, y).ball = ball;
		this.balls.push(ball);
		this.pixi.addChild(ball.pixi);
		return ball;
	}

	moveBall(from: [number, number], to: [number, number]): void {
		const [x1, y1] = from;
		const [x2, y2] = to;

		const ball = this.getBall(x1, y1);
		if (!ball) {
			throw `Tried to move non-existing ball at ` +
					`at (${x1}, ${y1})`;
		}

		if (this.getBall(x2, y2)) {
			throw `Tried to move ball on top of another ball ` +
					`at (${x2}, ${y2})`;
		}

		this.getCell(x1, y1).ball = null;
		ball.p.x = x2;
		ball.p.y = y2;
		this.getCell(x2, y2).ball = ball;
	}

	removeBall(x: number, y: number): void {
		const ball = this.getBall(x, y);
		if (!ball) {
			throw `Tried to remove non-existing ball ` +
					`at (${x}, ${y})`;
		}
		this.pixi.removeChild(ball.pixi);
		this.balls = this.balls.filter((b) => b !== ball);
		this.getCell(x, y).ball = null;
	}

	nextStep(step: number): void {
		this.balls.forEach((ball) => {
			const from: [number, number] =
					[ball.p.x, ball.p.y];
			const to: [number, number] =
					[ball.p.x + ball.d.vx, ball.p.y + ball.d.vy];
			this.moveBall(from, to);
		});
		this.balls.forEach((ball) => {
			ball.handleWallCollisions(this);
		});
		this.balls.forEach((ball) => {
			ball.handleBallCollisions(this);
		});
		this.balls.forEach((ball) => {
			ball.placeDots(step);
		});
	}

	reset(): void {
		this.balls.forEach((ball) => {
			this.getCell(ball.p.x, ball.p.y).ball = null;
		});
		this.balls.forEach((ball) => {
			ball.p.x = ball.resetPosition.x;
			ball.p.y = ball.resetPosition.y;
			ball.d = ball.resetDirection;
			ball.dots = [];
			ball.dotsLayer.removeChildren();
			this.getCell(ball.p.x, ball.p.y).ball = ball;
		});
	}

	showNormalGrid(): void {
		this.grid.visible = true;
		this.wallGrid.visible = false;
	}

	showWallGrid(): void {
		this.grid.visible = false;
		this.wallGrid.visible = true;
	}

	serialize(): string {
		let balls: any = [];
		this.balls.forEach((ball) => {
			balls.push({
				'x': ball.p.x,
				'y': ball.p.y,
				'vx': ball.d.vx,
				'vy': ball.d.vy
			});
		});
		let walls: any = [];
		this.walls.forEach((wall) => {
			walls.push({
				'x': wall.p.x,
				'y': wall.p.y,
				'p': wall.positive
			});
		});
		let obj: any = {
			'_version': 1,
			'balls': balls,
			'walls': walls
		};
		return JSON.stringify(obj);
	}
}

export {World};

