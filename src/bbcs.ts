import * as PIXI from 'pixi.js';

import {Direction, Ball} from './ball';
import {World} from './world';
import {Button, Separator, Toolbar} from './ui';

enum EditMode {
	SELECT, ADD_BALL, ADD_WALL, DELETE
}

enum SimulationMode {
	RUNNING, PAUSED
}

class BBCS {
	private app: PIXI.Application;

	zoom = 0.6;

	editMode: EditMode = EditMode.SELECT;
	time: number = 0.0;
	timeStep: number = 0;

	simulationMode: SimulationMode = SimulationMode.PAUSED;
	timeSpeed: number = 0.02;

	world: World;

	private bottomBar: Toolbar;
	private runButton: Button;
	private pauseButton: Button;

	private selectButton: Button;
	private addBallButton: Button;
	private addWallButton: Button;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.world = new World();

		this.bottomBar = new Toolbar();
		this.runButton = new Button("play", "Run simulation");
		this.pauseButton = new Button("pause", "Pause simulation");
		this.runButton.onClick(
			() => {
				this.simulationMode = SimulationMode.RUNNING;
				this.runButton.setPressed(true);
				this.pauseButton.setPressed(false);
			}
		);
		this.pauseButton.onClick(
			() => {
				this.simulationMode = SimulationMode.PAUSED;
				this.runButton.setPressed(false);
				this.pauseButton.setPressed(true);
			}
		);
		this.pauseButton.setPressed(true);
		this.bottomBar.addChild(this.runButton);
		this.bottomBar.addChild(this.pauseButton);

		this.bottomBar.addChild(new Separator());

		this.selectButton = new Button(
			"select", "Select objects");
		this.selectButton.setPressed(true);
		this.selectButton.onClick(
			() => {
				this.editMode = EditMode.SELECT;
				this.selectButton.setPressed(true);
				this.addBallButton.setPressed(false);
				this.addWallButton.setPressed(false);
			}
		);
		this.bottomBar.addChild(this.selectButton);

		this.addBallButton = new Button(
			"add-ball", "Add balls");
		this.addBallButton.onClick(
			() => {
				this.editMode = EditMode.ADD_BALL;
				this.selectButton.setPressed(false);
				this.addBallButton.setPressed(true);
				this.addWallButton.setPressed(false);
			}
		);
		this.bottomBar.addChild(this.addBallButton);

		this.addWallButton = new Button(
			"add-wall", "Add walls");
		this.addWallButton.onClick(
			() => {
				this.editMode = EditMode.ADD_WALL;
				this.selectButton.setPressed(false);
				this.addBallButton.setPressed(false);
				this.addWallButton.setPressed(true);
			}
		);
		this.bottomBar.addChild(this.addWallButton);

		this.bottomBar.addChild(new Button(
			"delete", "Delete objects",
			() => {
				this.editMode = EditMode.DELETE;
			}
		));

		this.setup();
	}

	setup() {
		this.app.stage.addChild(this.world.pixi);

		/*this.world.addBall(2, -2, Direction.RIGHT);
		this.world.addBall(4, -4, Direction.UP);
		this.world.addBall(8, -4, Direction.LEFT);
		this.world.addBall(10, -8, Direction.UP);
		this.world.addBall(7, -5, Direction.LEFT);
		//this.world.addBall(6, -2, Direction.DOWN);
		this.world.addBall(12, -12, Direction.UP);
		//this.world.addBall(12, 6, Direction.DOWN);*/
		
		// and gate
		this.world.addBall(-3, 1, Direction.RIGHT);
		this.world.addBall(0, 4, Direction.DOWN);
		this.world.addWall([1, 3], [2, 2]);
		this.world.addWall([-2, -2], [-1, -3]);

		this.bottomBar.rebuildPixi();
		this.app.stage.addChild(this.bottomBar.getPixi());

		this.world.balls.forEach((ball) => {
			ball.placeDots(0);
		});

		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});

		// click handler
		this.world.pixi.interactive = true;
		this.world.pixi.hitArea =
				new PIXI.Rectangle(-10000, -10000, 20000, 20000);
		this.world.pixi.on('click',
				(e: PIXI.interaction.InteractionEvent) => {
			const p = e.data.getLocalPosition(this.world.pixi);
			let x = p.x / 80;
			let y = -p.y / 80;
			console.log(x, y);

			if (this.editMode === EditMode.ADD_BALL) {
				x = Math.round(x);
				y = Math.round(y);

				if ((x + y) % 2 === 0) {
					const ball = this.world.getBall(x, y);
					if (ball) {
						ball.rotateClockwise();
					} else {
						this.world.addBall(x, y, Direction.RIGHT);
					}
				}
			}

			if (this.editMode === EditMode.ADD_WALL) {
				x = Math.floor(x);
				y = Math.floor(y);

				let from: [number, number], to: [number, number];
				if ((x + y) % 2 === 0) {
					[from, to] = [[x, y], [x + 1, y + 1]];
				} else {
					[from, to] = [[x + 1, y], [x, y + 1]];
				}
				if (!this.world.hasWall(from, to)) {
					this.world.addWall(from, to);
				}
			}
		});

		// we need to catch scroll events by adding a listener to the HTML
		// canvas as, unfortunately, PIXI doesn't handle scroll events
		this.app.view.addEventListener('wheel',
				(e: WheelEvent) => {
			if (e.deltaY > 0) {
				this.zoom *= 0.8;
			} else {
				this.zoom /= 0.8;
			}
			if (this.zoom < 0.2) {
				this.zoom = 0.2;
			} else if (this.zoom > 3) {
				this.zoom = 3;
			}
			this.update();
		}, {passive: true});

		this.update();
	}

	update(): void {
		this.world.pixi.scale.set(this.zoom);
		this.world.pixi.rotation = -Math.PI / 4;

		//if (this.editMode === EditMode.SELECT) {
		//	this.world.showNormalGrid();
		//} else {
			this.world.showWallGrid();
		//}
	}

	renderFrame(delta: number): void {
		if (this.simulationMode === SimulationMode.RUNNING) {
			this.time += this.timeSpeed * (1 + delta);
		}
		while (Math.floor(this.time) > this.timeStep) {
			this.timeStep++;
			try {
				this.world.nextStep(this.timeStep);
			} catch (e) {
				window.alert(`Illegal move: ${e}. Resetting the simulation.`);
				this.simulationMode = SimulationMode.PAUSED;
				this.runButton.setPressed(false);
				this.pauseButton.setPressed(true);
				this.world.reset();
				this.time = 0;
				this.timeStep = 0;
			}
		}

		this.app.stage.x = window.innerWidth / 2;
		this.app.stage.y = window.innerHeight / 2;
		
		this.bottomBar.setPosition(
			-this.bottomBar.getWidth() / 2,
			window.innerHeight / 2 - this.bottomBar.getHeight());

		this.world.balls.forEach((ball) => {
			ball.update(this.time, this.timeStep);
		});
	}
}

export {BBCS};

