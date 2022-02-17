import * as PIXI from 'pixi.js';

import { Square, Color } from './square';
import { World, Move } from './world';
import { IconButton, TextButton, Label, Separator, Toolbar, StepCountLabel, PhaseLabel } from './ui';

import { GatherAndCompactAlgorithm } from './algorithms/gather-and-compact';
import { CustomAlgorithm } from './algorithms/custom';

enum EditMode {
	SELECT, ADD_SQUARE
}

enum SimulationMode {
	RUNNING, PAUSED, RESET
}

class SquaresSimulator {

	readonly AVAILABLE_ALGORITHMS: { [name: string]: new (world: World) => { execute(): Generator<Move, void, undefined> } } = {
		"Gather & Compact": GatherAndCompactAlgorithm,
		"Custom move sequence": CustomAlgorithm
	};
	selectedAlgorithm = "Gather & Compact";

	private app: PIXI.Application;

	editMode: EditMode = EditMode.SELECT;
	time: number = 0;
	timeStep: number = 0;
	runUntil: number = Infinity;

	simulationMode: SimulationMode = SimulationMode.RESET;
	timeSpeed: number = 0.1;

	world: World;
	algorithm: Generator<Move> | null = null;

	// selected objects
	private selection: Square[] = [];

	// color of last-edited square
	// (remembered to insert new squares with the same color)
	private lastColor = Color.GRAY;

	// GUI elements
	private topBar: Toolbar;
	private bottomBar: Toolbar;
	private bottomBarOffset = 0;
	private statusBar: Toolbar;

	private runButton: IconButton;
	private stepButton: IconButton;
	private resetButton: IconButton;
	private algorithmButton: TextButton;
	private showConnectivityButton: IconButton;
	private helpButton: IconButton;

	private selectButton: IconButton;
	private addSquareButton: IconButton;
	private colorButton: IconButton;
	private deleteButton: IconButton;
	private saveButton: IconButton;

	private stepCounter: StepCountLabel;
	private phaseLabel: PhaseLabel;
	private slowerButton: IconButton;
	private fasterButton: IconButton;

	private textArea = document.getElementById('save-textarea') as HTMLTextAreaElement;
	private ipeArea = document.getElementById('ipe-textarea') as HTMLTextAreaElement;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.world = new World();

		this.topBar = new Toolbar(false);

		this.runButton = new IconButton("play", "Run simulation", false, "Space");
		this.runButton.onClick(this.run.bind(this));
		this.topBar.addChild(this.runButton);

		this.stepButton = new IconButton("step", "Run one step", false);
		this.stepButton.onClick(this.step.bind(this));
		this.topBar.addChild(this.stepButton);

		this.resetButton = new IconButton("reset", "Reset simulation", false, "R");
		this.resetButton.onClick(this.reset.bind(this));
		this.resetButton.setEnabled(false);
		this.topBar.addChild(this.resetButton);

		this.topBar.addChild(new Separator());

		this.topBar.addChild(new Label("Algorithm:"));

		this.algorithmButton = new TextButton(this.selectedAlgorithm, 220, "Select algorithm to run", false);
		this.algorithmButton.onClick(this.toggleAlgorithm.bind(this));
		this.topBar.addChild(this.algorithmButton);

		this.topBar.addChild(new Separator());

		this.showConnectivityButton = new IconButton("show-connectivity", "Show connectivity", false);
		this.showConnectivityButton.onClick(this.showConnectivity.bind(this));
		this.topBar.addChild(this.showConnectivityButton);

		this.topBar.addChild(new Separator());

		this.helpButton = new IconButton("help", "Help", false);
		this.helpButton.onClick(this.help.bind(this));
		this.topBar.addChild(this.helpButton);


		this.bottomBar = new Toolbar(true);

		this.selectButton = new IconButton(
			"select", "Select objects", true, "S");
		this.selectButton.setPressed(true);
		this.selectButton.onClick(this.selectMode.bind(this));
		this.bottomBar.addChild(this.selectButton);

		this.addSquareButton = new IconButton(
			"add-square", "Add/remove squares", true, "C");
		this.addSquareButton.onClick(this.addSquaresMode.bind(this));
		this.bottomBar.addChild(this.addSquareButton);

		this.colorButton = new IconButton(
			"color", "Change color", true);
		this.colorButton.onClick(
			() => {
				this.selection.forEach((square) => {
					if (square instanceof Square) {
						square.nextColor();
						if (this.selection.length === 1) {
							this.lastColor = square.color;
						}
					}
				});
			}
		);
		this.colorButton.setEnabled(false);
		this.bottomBar.addChild(this.colorButton);

		this.deleteButton = new IconButton(
			"delete", "Delete selected", true, "Delete");
		this.deleteButton.onClick(this.delete.bind(this));
		this.deleteButton.setEnabled(false);
		this.bottomBar.addChild(this.deleteButton);

		this.bottomBar.addChild(new Separator());

		this.saveButton = new IconButton(
			"save", "Save & load", true);
		this.saveButton.onClick(this.save.bind(this));
		this.bottomBar.addChild(this.saveButton);


		this.statusBar = new Toolbar(true);

		this.stepCounter = new StepCountLabel(0);
		this.statusBar.addChild(this.stepCounter);

		this.statusBar.addChild(new Separator());

		this.phaseLabel = new PhaseLabel();
		phaseLabel = this.phaseLabel;
		this.statusBar.addChild(this.phaseLabel);

		this.statusBar.addChild(new Separator());

		this.slowerButton = new IconButton(
			"slower", "Slower", true);
		this.slowerButton.onClick(this.slower.bind(this));
		this.statusBar.addChild(this.slowerButton);

		this.fasterButton = new IconButton(
			"faster", "Faster", true);
		this.fasterButton.onClick(this.faster.bind(this));
		this.statusBar.addChild(this.fasterButton);


		// set up event handlers for dialog buttons
		const loadButton = document.getElementById('load-button');
		loadButton!.addEventListener('click', () => {
			document.getElementById('saveDialog')!.style.display = 'none';
			this.load(this.textArea.value);
		});

		const closeButton = document.getElementById('close-button');
		closeButton!.addEventListener('click', () => {
			document.getElementById('saveDialog')!.style.display = 'none';
		});

		const ipeCloseButton = document.getElementById('ipe-close-button');
		ipeCloseButton!.addEventListener('click', () => {
			document.getElementById('ipeDialog')!.style.display = 'none';
		});


		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});


		this.setup();
	}

	setup() {
		this.app.stage.addChild(this.world.viewport);

		this.topBar.rebuildPixi();
		this.app.stage.addChild(this.topBar.getPixi());

		this.bottomBar.rebuildPixi();
		this.app.stage.addChild(this.bottomBar.getPixi());

		this.statusBar.rebuildPixi();
		this.app.stage.addChild(this.statusBar.getPixi());

		// click handler
		this.world.pixi.interactive = true;
		this.world.pixi.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);  // TODO should be infinite ...
		this.world.pixi.on('click', this.worldClickHandler.bind(this));
		this.world.pixi.on('tap', this.worldClickHandler.bind(this));

		// key handlers
		window.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === " ") {
				this.run();
			} else if (event.key === "r") {
				this.reset();
			} else if (event.key === "s") {
				this.selectMode();
			} else if (event.key === "c") {
				this.addSquaresMode();
			} else if (event.key === "Delete") {
				this.delete();
			}
		});

		this.update();
	}

	update(): void {
	}

	select(square: Square): void {
		this.selection.push(square);
		square.selected = true;
		this.updateEditButtons();
	}

	deselect(): void {
		this.selection.forEach((square) => {
			square.selected = false;
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

		while (this.time >= this.timeStep) {
			// first actually execute the current move
			if (this.world.currentMove) {
				this.world.currentMove.execute();
				this.world.currentMove = null;
			}
			this.world.markComponents();

			if (this.time === this.timeStep) {
				break;
			}

			this.timeStep++;
			this.stepCounter.setStepCount(this.timeStep);

			try {
				const proposedMove = this.algorithm!.next();
				if (proposedMove.done) {
					console.log(`Time step ${this.timeStep}. No move left, so pausing the simulation.`);
					this.world.currentMove = null;
					this.run();  // pause
					this.runButton.setEnabled(false);
					this.stepButton.setEnabled(false);
					this.time = this.timeStep;
					break;
				}
				if (!proposedMove.value.isValid()) {
					throw new Error("Invalid move detected: " + proposedMove.value.toString());
				}

				this.world.currentMove = proposedMove.value;

			} catch (e) {
				const cryEmoji = String.fromCodePoint(parseInt('1F622', 16));
				console.log(`Time step ${this.timeStep}. Threw exception: ${e}. Pausing the simulation ${cryEmoji}`);
				this.phaseLabel.setPhase('Algorithm threw an exception (see console for details)');
				let message = '' + e;
				if (message.length > 50) {
					message = message.substring(0, 49) + '...';
				}
				this.phaseLabel.setSubPhase(message);
				this.run();  // pause
				this.runButton.setEnabled(false);
				this.stepButton.setEnabled(false);
				this.time = this.timeStep;
				break;
			}
			if (this.world.currentMove) {
				console.log(`Time step ${this.timeStep}. Move: ${this.world.currentMove.toString()}`);

				// mark components with the moving square removed
				const movingSquare = this.world.getSquare(this.world.currentMove.sourcePosition())!;
				this.world.removeSquareUnmarked(movingSquare);
				this.world.markComponents();
				this.world.addSquareUnmarked(movingSquare);
			}
		}

		this.world.pixi.x = window.innerWidth / 2;
		this.world.pixi.y = window.innerHeight / 2;
		this.world.backgroundPixi.x = window.innerWidth / 2;
		this.world.backgroundPixi.y = window.innerHeight / 2;
		this.world.gridPixi.x = window.innerWidth / 2;
		this.world.gridPixi.y = window.innerHeight / 2;
		this.world.treePixi.x = window.innerWidth / 2;
		this.world.treePixi.y = window.innerHeight / 2;

		this.topBar.setPosition(
			this.app.renderer.width / 2 - this.topBar.getWidth() / 2,
			0);
		this.bottomBar.setPosition(
			this.app.renderer.width / 2 - this.bottomBar.getWidth() / 2,
			this.app.renderer.height - this.bottomBar.getHeight() + Math.pow(this.bottomBarOffset, 2));
		this.statusBar.setPosition(
			this.app.renderer.width / 2 - this.statusBar.getWidth() / 2,
			this.app.renderer.height - this.statusBar.getHeight() + Math.pow(15 - this.bottomBarOffset, 2));

		if (this.simulationMode === SimulationMode.RESET) {
			this.bottomBarOffset = Math.max(this.bottomBarOffset - 0.5 * delta, 0);
		} else {
			this.bottomBarOffset = Math.min(this.bottomBarOffset + 0.5 * delta, 15);
		}

		this.world.updatePositions(this.time, this.timeStep);
	}

	worldClickHandler(e: PIXI.interaction.InteractionEvent): void {
		const p = e.data.getLocalPosition(this.world.pixi);
		let x = p.x / 80;
		let y = -p.y / 80;

		if (this.simulationMode === SimulationMode.RESET) {

			if (this.editMode === EditMode.SELECT) {
				this.deselect();
				const square = this.world.getSquare([Math.round(x), Math.round(y)]);
				if (square) {
					this.deselect();
					this.select(square);
				}
			}

			if (this.editMode === EditMode.ADD_SQUARE) {
				x = Math.round(x);
				y = Math.round(y);

				const square = this.world.getSquare([x, y]);
				if (!square) {
					const newSquare = new Square(this.world, [x, y], this.lastColor);
					this.world.addSquare(newSquare);
					this.deselect();
					this.select(newSquare);
				} else {
					this.world.removeSquare(square);
				}
			}
		}
	}

	createAlgorithm(): Generator<Move> {
		return new this.AVAILABLE_ALGORITHMS[this.selectedAlgorithm](this.world).execute();
	}

	// button handlers

	run(): void {
		if (this.simulationMode === SimulationMode.RUNNING) {
			this.simulationMode = SimulationMode.PAUSED;
			this.runButton.setIcon("play");
			this.runButton.setTooltip("Run simulation");
			this.stepButton.setEnabled(true);
		} else {
			if (!this.world.isConnected()) {
				alert("The configuration is not connected. " +
					"Make sure to enter a connected configuration before running the algorithm.");
				return;
			}
			this.runUntil = Infinity;
			this.simulationMode = SimulationMode.RUNNING;
			this.runButton.setIcon("pause");
			this.runButton.setTooltip("Pause simulation");
			this.stepButton.setEnabled(false);
		}

		if (this.selectButton.isEnabled()) {
			this.algorithm = this.createAlgorithm();
			this.deselect();
			this.selectButton.setEnabled(false);
			this.addSquareButton.setEnabled(false);
			this.saveButton.setEnabled(false);
			this.algorithmButton.setEnabled(false);
		}
		this.resetButton.setEnabled(true);
	}

	step(): void {
		this.runUntil = Math.floor(this.time) + 1;
		this.simulationMode = SimulationMode.RUNNING;
		this.runButton.setIcon("pause");
		this.runButton.setTooltip("Pause simulation");

		if (this.selectButton.isEnabled()) {
			this.algorithm = this.createAlgorithm();
			this.deselect();
			this.selectButton.setEnabled(false);
			this.addSquareButton.setEnabled(false);
			this.saveButton.setEnabled(false);
			this.algorithmButton.setEnabled(false);
		}
		this.stepButton.setEnabled(false);
		this.resetButton.setEnabled(true);
	}

	reset(): void {
		this.simulationMode = SimulationMode.RESET;
		this.runButton.setIcon("play");
		this.runButton.setTooltip("Run simulation");
		this.runButton.setEnabled(true);
		this.stepButton.setEnabled(true);
		this.resetButton.setEnabled(false);

		this.selectButton.setEnabled(true);
		this.addSquareButton.setEnabled(true);
		this.saveButton.setEnabled(true);
		this.algorithmButton.setEnabled(true);

		this.world.reset();
		this.time = 0;
		this.timeStep = 0;
		this.runUntil = Infinity;
		this.algorithm = null;
	}

	selectMode(): void {
		this.editMode = EditMode.SELECT;
		this.selectButton.setPressed(true);
		this.addSquareButton.setPressed(false);
	}

	addSquaresMode(): void {
		this.editMode = EditMode.ADD_SQUARE;
		this.selectButton.setPressed(false);
		this.addSquareButton.setPressed(true);
	}

	delete(): void {
		this.selection.forEach((square) => {
			this.world.removeSquare(square);
		});
		this.deselect();
	}

	save(): void {
		const file = this.world.serialize();
		const dialogs = document.getElementById('saveDialog');
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

	ipeExport(): void {
		const file = this.world.serialize();
		const dialogs = document.getElementById('ipeDialog');
		dialogs!.style.display = 'block';
		this.ipeArea.value = this.world.toIpe();
	}

	showConnectivity(): void {
		this.showConnectivityButton.setPressed(!this.showConnectivityButton.isPressed());
		this.world.showComponentMarks = this.showConnectivityButton.isPressed();
		for (let square of this.world.squares) {
			square.updatePixi();
		}
	}

	help(): void {
		const container = document.getElementById('squares-simulator-container')!;
		if (this.helpButton.isPressed()) {
			this.helpButton.setPressed(false);
			document.body.classList.remove('help-pane-open');
			this.app.renderer.resize(container.offsetWidth + 600, container.offsetHeight);
		} else {
			this.helpButton.setPressed(true);
			document.body.classList.add('help-pane-open');
		}
		const self = this;
		setTimeout(function () {
			self.app.renderer.resize(container.offsetWidth, container.offsetHeight);
		}, 600);
	}

	slower(): void {
		this.timeSpeed /= 2;
		if (this.timeSpeed < 0.0125) {
			this.timeSpeed = 0.0125;
			this.slowerButton.setEnabled(false);
		}
		this.fasterButton.setEnabled(true);
	}

	faster(): void {
		this.timeSpeed *= 2;
		if (this.timeSpeed > 1.6) {
			this.timeSpeed = 1.6;
			this.fasterButton.setEnabled(false);
		}
		this.slowerButton.setEnabled(true);
	}

	toggleAlgorithm(): void {
		const dialogs = document.getElementById('algorithmDialog')!;
		dialogs.style.display = 'block';

		const container = document.getElementById('algorithmDialogContainer')!;
		container.innerHTML = '';
		for (let algorithmName in this.AVAILABLE_ALGORITHMS) {
			let item = document.createElement('a');
			item.innerHTML = algorithmName;
			item.classList.add('algorithm-button');
			let self = this;
			item.onclick = function () {
				self.selectedAlgorithm = algorithmName;
				self.algorithmButton.setText(algorithmName);
				dialogs.style.display = 'none';
			};
			container?.appendChild(item);
		}
	}
}

class Constants {
	static readonly tooltipStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 16,
		fill: "white"
	});
	static readonly tooltipSmallStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 12,
		fill: "white"
	});
	static readonly stepCountStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 40,
		fontWeight: "bold",
		fill: "black"
	});
	static readonly smallLabelStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 15,
		fill: "black"
	});
	static readonly phaseLabelStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 18,
		fontWeight: "bold",
		fill: "black"
	});
	static readonly subPhaseLabelStyle = new PIXI.TextStyle({
		fontFamily: "Fira Sans, Segoe UI, Tahoma, sans-serif",
		fontSize: 18,
		fill: "black"
	});
}

export { SquaresSimulator, Constants };

