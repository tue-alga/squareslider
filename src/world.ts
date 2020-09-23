import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Ball, Direction, Color} from './ball';

type WorldCell = {
	ball: Ball | null;
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
				return clamp(-abs(mod(coord - 0.0, 160.0) - 80.0) + lineWidth, 0.0, 1.0);
			}

			void main() {
				float zoom = translationMatrix[1][1];
				float width = 3.0 / sqrt(zoom);
				float base = clamp(1.1 - zoom, 0.9, 1.0);
				float xMod = gridValue(uv.x * 2.0, width);
				float yMod = gridValue(uv.y * 2.0, width);
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
				ball: null
			};
		}
		return column[y];
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
		this.balls.forEach((cube) => {
			const from: [number, number] =
					[cube.p.x, cube.p.y];
			const to: [number, number] =
					[cube.p.x + cube.d.vx, cube.p.y + cube.d.vy];
			this.moveBall(from, to);
		});
		this.balls.forEach((cube) => {
			cube.placeDots(step);
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
		let cubes: any = [];
		this.balls.forEach((cube) => {
			cubes.push({
				'x': cube.resetPosition.x,
				'y': cube.resetPosition.y,
				'color': [cube.color.r, cube.color.g, cube.color.b]
			});
		});
		let obj: any = {
			'_version': 1,
			'cubes': cubes
		};
		return JSON.stringify(obj);
	}

	deserialize(data: string): void {
		let obj: any = JSON.parse(data);

		if (obj['_version'] > 1) {
			throw 'Save file with incorrect version';
		}

		let cubes: any[] = obj['cubes'];
		cubes.forEach((cube: any) => {
			let color = Color.BLUE;
			if (cube.hasOwnProperty('color')) {
				color = new Color(cube['color'][0],
					cube['color'][1], cube['color'][2]);
			}
			this.addBall(cube['x'], cube['y'], new Direction(0, 0), color);
		});
	}
}

export {World};

