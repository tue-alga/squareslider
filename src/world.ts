import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Ball, Direction, Color} from './ball';
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
	grid: PIXI.Mesh;

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

		const gridLineShader = `
		uniform mat3 projectionMatrix;
		`;

		const gridGeometry = new PIXI.Geometry().addAttribute('aVertexPosition',
			[
				-1e6, -1e6, 1e6, -1e6, 1e6, 1e6,
				1e6, 1e6, -1e6, 1e6, -1e6, -1e6
			]);
		const gridShader = PIXI.Shader.from(`
			precision mediump float;
			attribute vec2 aVertexPosition;

			uniform mat3 translationMatrix;
			uniform mat3 projectionMatrix;

			varying vec2 uv;

			void main() {
				gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
				uv = aVertexPosition;
			}`,
			`precision mediump float;

			uniform mat3 translationMatrix;

			varying vec2 uv;

			float gridValue(float coord, float lineWidth) {
				return clamp(-abs(mod(coord - 80.0, 160.0) - 80.0) + lineWidth, 0.0, 1.0);
			}

			void main() {
				float zoom = translationMatrix[1][1];
				float width = 3.0 / sqrt(zoom);
				float base = clamp(1.1 - zoom, 0.9, 1.0);
				float xMod = gridValue(uv.x + uv.y, width);
				float yMod = gridValue(uv.y - uv.x, width);
				float gray = base + (1.0 - max(xMod, yMod)) * (1.0 - base);
				gl_FragColor = vec4(gray, gray, gray, 1.0);
			}
			`);
		this.grid = new PIXI.Mesh(gridGeometry, gridShader);
		this.pixi.addChild(this.grid);
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
		return this.addWallTopLeft(x3, y3, wallIsPositive);
	}
	
	private addWallTopLeft(x: number, y: number, positive: boolean): Wall {
		let wall = new Wall(this, x, y, positive);
		if (positive) {
			this.getCell(x, y).positiveWall = wall;
		} else {
			this.getCell(x, y).negativeWall = wall;
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

	addBall(x: number, y: number, d: Direction, color: Color): Ball {
		if (this.getBall(x, y)) {
			throw `Tried to insert ball on top of another ball ` +
					`at (${x}, ${y})`;
		}
		const ball = new Ball(this, x, y, d, color);
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

	serialize(): string {
		let balls: any = [];
		this.balls.forEach((ball) => {
			balls.push({
				'x': ball.resetPosition.x,
				'y': ball.resetPosition.y,
				'vx': ball.resetDirection.vx,
				'vy': ball.resetDirection.vy,
				'color': [ball.color.r, ball.color.g, ball.color.b]
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
			'_version': 2,
			'balls': balls,
			'walls': walls
		};
		return JSON.stringify(obj);
	}

	deserialize(data: string): void {
		let obj: any = JSON.parse(data);

		if (obj['_version'] > 2) {
			throw 'Save file with incorrect version';
		}

		let balls: any[] = obj['balls'];
		balls.forEach((ball: any) => {
			let color = Color.BLUE;
			if (ball.hasOwnProperty('color')) {
				color = new Color(ball['color'][0],
					ball['color'][1], ball['color'][2]);
			}
			this.addBall(ball['x'], ball['y'], new Direction(ball['vx'], ball['vy']), color);
		});

		let walls: any[] = obj['walls'];
		walls.forEach((wall: any) => {
			this.addWallTopLeft(wall['x'], wall['y'], wall['p']);
		});
	}
}

export {World};

