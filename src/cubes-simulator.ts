import * as PIXI from 'pixi.js';

import {Cube, Color} from './cube';
import {World, Move} from './world';
import {Button, Separator, Toolbar} from './ui';

enum EditMode {
	SELECT, ADD_BALL
}

enum SimulationMode {
	RUNNING, PAUSED, RESET
}

class CubesSimulator {
	private app: PIXI.Application;

	editMode: EditMode = EditMode.SELECT;
	time: number = 0.0;
	timeStep: number = 0;
	runUntil: number = Infinity;
	skipSiphoning: boolean = true;

	simulationMode: SimulationMode = SimulationMode.RESET;
	timeSpeed: number = 0.1;

	world: World;
	algorithm: Generator<Move> | null = null;

	// selected objects
	private selection: Cube[] = [];

	// color of last-edited cube
	// (remembered to insert new cubes with the same color)
	private lastColor = Color.GRAY;

	// GUI elements
	private bottomBar: Toolbar;

	private runButton: Button;
	private stepButton: Button;
	private resetButton: Button;
	
	private selectButton: Button;
	private addCubeButton: Button;
	private colorButton: Button;
	private deleteButton: Button;

	private saveButton: Button;

	private textArea = document.getElementById('save-textarea') as HTMLTextAreaElement;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.world = new World();

		this.bottomBar = new Toolbar();

		this.runButton = new Button("play", "Run simulation", "Space");
		this.runButton.onClick(this.run.bind(this));
		this.bottomBar.addChild(this.runButton);

		this.stepButton = new Button("step", "Run one step");
		this.stepButton.onClick(this.step.bind(this));
		this.bottomBar.addChild(this.stepButton);

		this.resetButton = new Button("reset", "Reset simulation", "R");
		this.resetButton.onClick(this.reset.bind(this));
		this.resetButton.setEnabled(false);
		this.bottomBar.addChild(this.resetButton);

		this.bottomBar.addChild(new Separator());

		this.selectButton = new Button(
			"select", "Select objects", "S");
		this.selectButton.setPressed(true);
		this.selectButton.onClick(this.selectMode.bind(this));
		this.bottomBar.addChild(this.selectButton);

		this.addCubeButton = new Button(
			"add-ball", "Add/remove cubes", "C");
		this.addCubeButton.onClick(this.addCubesMode.bind(this));
		this.bottomBar.addChild(this.addCubeButton);

		this.colorButton = new Button(
			"color", "Change color");
		this.colorButton.onClick(
			() => {
				this.selection.forEach((cube) => {
					if (cube instanceof Cube) {
						cube.nextColor();
						if (this.selection.length === 1) {
							this.lastColor = cube.color;
						}
					}
				});
			}
		);
		this.colorButton.setEnabled(false);
		this.bottomBar.addChild(this.colorButton);

		this.deleteButton = new Button(
			"delete", "Delete selected", "Delete");
		this.deleteButton.onClick(this.delete.bind(this));
		this.deleteButton.setEnabled(false);
		this.bottomBar.addChild(this.deleteButton);

		this.bottomBar.addChild(new Separator());

		this.saveButton = new Button(
			"save", "Save & load");
		this.saveButton.onClick(this.save.bind(this));
		this.bottomBar.addChild(this.saveButton);


		// set up event handlers for dialog buttons
		const loadButton = document.getElementById('load-button');
		loadButton!.addEventListener('click', () => {
			document.getElementById('dialogs')!.style.display = 'none';
			this.load(this.textArea.value);
		});

		const closeButton = document.getElementById('close-button');
		closeButton!.addEventListener('click', () => {
			document.getElementById('dialogs')!.style.display = 'none';
		});


		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});


		this.setup();
	}

	setup() {
		this.app.stage.addChild(this.world.viewport);

		this.bottomBar.rebuildPixi();
		this.app.stage.addChild(this.bottomBar.getPixi());

		// click handler
		this.world.pixi.interactive = true;
		this.world.pixi.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);  // TODO should be infinite ...
		this.world.pixi.on('click', this.worldClickHandler.bind(this));
		this.world.pixi.on('tap', this.worldClickHandler.bind(this));

		// TODO debug data
		for (let x = 0; x < 4; x++) {
			for (let y = 0; y < 4; y++) {
				this.world.addCube([x, y], Color.GRAY);
			}
		}

		/*for (let x = 0; x < 8; x++) {
			this.world.addCube([x, 0], Color.GRAY);
			this.world.addCube([x, 1], Color.GRAY);
			this.world.addCube([x, 6], Color.GRAY);
			this.world.addCube([x, 7], Color.GRAY);
		}
		for (let x = 6; x < 8; x++) {
			this.world.addCube([x, 2], Color.GRAY);
			this.world.addCube([x, 3], Color.GRAY);
			this.world.addCube([x, 4], Color.GRAY);
			this.world.addCube([x, 5], Color.GRAY);
		}*/

		/*this.world.addCube(0, 0, Color.GRAY);
		this.world.addCube(0, 1, Color.GRAY);
		this.world.addCube(-2, 2, Color.GRAY);
		this.world.addCube(-1, 2, Color.GRAY);
		this.world.addCube(0, 2, Color.GRAY);
		this.world.addCube(1, 2, Color.GRAY);
		this.world.addCube(2, 2, Color.GRAY);
		this.world.addCube(3, 2, Color.GRAY);
		this.world.addCube(-2, 3, Color.GRAY);
		this.world.addCube(3, 3, Color.GRAY);
		this.world.addCube(-2, 4, Color.GRAY);
		this.world.addCube(1, 4, Color.GRAY);
		this.world.addCube(2, 4, Color.GRAY);
		this.world.addCube(3, 4, Color.GRAY);
		this.world.addCube(4, 4, Color.GRAY);
		this.world.addCube(-2, 5, Color.GRAY);
		this.world.addCube(-1, 5, Color.GRAY);
		this.world.addCube(0, 5, Color.GRAY);
		this.world.addCube(1, 5, Color.GRAY);
		this.world.addCube(4, 5, Color.GRAY);
		this.world.addCube(0, 6, Color.GRAY);
		this.world.addCube(3, 6, Color.GRAY);
		this.world.addCube(4, 6, Color.GRAY);
		this.world.addCube(0, 7, Color.GRAY);
		this.world.addCube(1, 7, Color.GRAY);
		this.world.addCube(2, 7, Color.GRAY);
		this.world.addCube(3, 7, Color.GRAY);
		this.world.addCube(1, 8, Color.GRAY);
		this.world.addCube(1, 9, Color.GRAY);
		this.world.addCube(-1, 10, Color.GRAY);
		this.world.addCube(0, 10, Color.GRAY);
		this.world.addCube(1, 10, Color.GRAY);
		this.world.addCube(2, 10, Color.GRAY);
		this.world.addCube(-1, 11, Color.GRAY);
		this.world.addCube(2, 11, Color.GRAY);
		this.world.addCube(-1, 12, Color.GRAY);
		this.world.addCube(1, 12, Color.GRAY);
		this.world.addCube(2, 12, Color.GRAY);
		this.world.addCube(-1, 13, Color.GRAY);
		this.world.addCube(0, 13, Color.GRAY);
		this.world.addCube(1, 13, Color.GRAY);
		// tail
		this.world.addCube(5, 5, Color.GRAY);
		this.world.addCube(6, 5, Color.GRAY);
		this.world.addCube(7, 5, Color.GRAY);
		this.world.addCube(8, 5, Color.GRAY);
		this.world.addCube(9, 5, Color.GRAY);
		this.world.addCube(7, 6, Color.GRAY);
		this.world.addCube(8, 6, Color.GRAY);
		this.world.addCube(9, 6, Color.GRAY);
		this.world.addCube(7, 7, Color.GRAY);
		this.world.addCube(8, 7, Color.GRAY);
		this.world.addCube(9, 7, Color.GRAY);*/
		// TODO debug data until here

		// key handlers
		window.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === " ") {
				this.run();
			} else if (event.key === "r") {
				this.reset();
			} else if (event.key === "s") {
				this.selectMode();
			} else if (event.key === "c") {
				this.addCubesMode();
			} else if (event.key === "Delete") {
				this.delete();
			}
		});

		this.update();
	}

	update(): void {
	}

	select(obj: Cube): void {
		this.selection.push(obj);
		obj.selected = true;
		this.updateEditButtons();
	}

	deselect(): void {
		this.selection.forEach((cube) => {
			cube.selected = false;
		});

		this.selection = [];
		this.updateEditButtons();
	}

	private updateEditButtons(): void {
		this.colorButton.setEnabled(this.selection.length > 0);
		this.deleteButton.setEnabled(this.selection.length > 0);
	}

	renderFrame(delta: number): void {
		if (this.simulationMode === SimulationMode.RUNNING) {
			this.time += this.timeSpeed * delta;

			if (this.time > this.runUntil) {
				this.time = this.runUntil;
				this.simulationMode = SimulationMode.PAUSED;
				this.runButton.setIcon("play");
				this.runButton.setTooltip("Run simulation");
				this.stepButton.setEnabled(true);
			}
		}

		while (this.time > this.timeStep) {
			this.timeStep++;
			try {
				this.world.nextStep(this.algorithm!, this.timeStep);
				if (this.skipSiphoning &&
						this.world.currentMove &&
						(this.world.currentMove.position[0] < 0 ||
						this.world.currentMove.position[1] < 0)) {
					this.time += 1;
				}
			} catch (e) {
				const cryEmoji = String.fromCodePoint(parseInt('1F622', 16));
				console.log(`Time step ${this.timeStep}. Threw exception: ${e}. Pausing the simulation ${cryEmoji}`);
				this.run();  // pause
				throw e;
				break;
			}
			if (this.world.currentMove) {
				console.log(`Time step ${this.timeStep}. Move: ${this.world.currentMove.toString()}`);
			}
			if (this.simulationMode === SimulationMode.RUNNING &&
					!this.world.currentMove) {
				console.log(`Time step ${this.timeStep}. No move left, so pausing the simulation.`);
				this.run();  // pause
				break;
			}
		}

		this.world.pixi.x = window.innerWidth / 2;
		this.world.pixi.y = window.innerHeight / 2;
		
		this.bottomBar.setPosition(
			window.innerWidth / 2 - this.bottomBar.getWidth() / 2,
			window.innerHeight - this.bottomBar.getHeight());

		this.world.updatePositions(this.time, this.timeStep);
	}
	
	worldClickHandler(e: PIXI.interaction.InteractionEvent): void {
		const p = e.data.getLocalPosition(this.world.pixi);
		let x = p.x / 80;
		let y = -p.y / 80;

		if (this.simulationMode === SimulationMode.RESET) {

			if (this.editMode === EditMode.SELECT) {
				this.deselect();
				const cube = this.world.getCube([Math.round(x), Math.round(y)]);
				if (cube) {
					this.deselect();
					this.select(cube);
				}
			}

			if (this.editMode === EditMode.ADD_BALL) {
				x = Math.round(x);
				y = Math.round(y);

				const cube = this.world.getCube([x, y]);
				if (!cube) {
					const newCube = this.world.addCube([x, y], this.lastColor);
					this.deselect();
					this.select(newCube);
				} else {
					this.world.removeCube(cube.p);
				}
			}
		}
	}

	// button handlers

	run(): void {
		if (this.simulationMode === SimulationMode.RUNNING) {
			this.simulationMode = SimulationMode.PAUSED;
			this.runButton.setIcon("play");
			this.runButton.setTooltip("Run simulation");
			this.stepButton.setEnabled(true);
		} else {
			this.runUntil = Infinity;
			this.simulationMode = SimulationMode.RUNNING;
			this.runButton.setIcon("pause");
			this.runButton.setTooltip("Pause simulation");
			this.stepButton.setEnabled(false);
		}

		if (this.selectButton.isEnabled()) {
			this.algorithm = this.world.moveToRectangle();
			this.deselect();
			this.selectButton.setEnabled(false);
			this.addCubeButton.setEnabled(false);
			this.saveButton.setEnabled(false);
		}
		this.resetButton.setEnabled(true);
	}

	step(): void {
		this.runUntil = Math.floor(this.time) + 1;
		this.simulationMode = SimulationMode.RUNNING;
		this.runButton.setIcon("pause");
		this.runButton.setTooltip("Pause simulation");

		if (this.selectButton.isEnabled()) {
			this.algorithm = this.world.moveToRectangle();
			this.deselect();
			this.selectButton.setEnabled(false);
			this.addCubeButton.setEnabled(false);
			this.saveButton.setEnabled(false);
		}
		this.stepButton.setEnabled(false);
		this.resetButton.setEnabled(true);
	}

	reset(): void {
		this.simulationMode = SimulationMode.RESET;
		this.runButton.setIcon("play");
		this.runButton.setTooltip("Run simulation");
		this.stepButton.setEnabled(true);
		this.resetButton.setEnabled(false);

		this.selectButton.setEnabled(true);
		this.addCubeButton.setEnabled(true);
		this.saveButton.setEnabled(true);

		this.world.reset();
		this.time = 0;
		this.timeStep = 0;
		this.runUntil = Infinity;
		this.algorithm = null;
	}

	selectMode(): void {
		this.editMode = EditMode.SELECT;
		this.selectButton.setPressed(true);
		this.addCubeButton.setPressed(false);
	}

	addCubesMode(): void {
		this.editMode = EditMode.ADD_BALL;
		this.selectButton.setPressed(false);
		this.addCubeButton.setPressed(true);
	}
	
	delete(): void {
		this.selection.forEach((obj) => {
			if (obj instanceof Cube) {
				this.world.removeCube(obj.p);
			}
			this.deselect();
		});
	}

	save(): void {
		const file = this.world.serialize();
		const dialogs = document.getElementById('dialogs');
		dialogs!.style.display = 'block';
		this.textArea.value = file;
	}

	load(data: string): void {
		const newWorld = new World();
		try {
			newWorld.deserialize(data);
		} catch (e) {
			window.alert('Could not read JSON data: ' + e);
			return;
		}
		this.world = newWorld;
		this.app.stage.removeChildren();
		this.setup();
	}
}

class Constants {
	static readonly tooltipStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans",
		fontSize: 16,
		fill: "white"
	});
	static readonly tooltipSmallStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans",
		fontSize: 12,
		fill: "white"
	});
}

export {CubesSimulator, Constants};

