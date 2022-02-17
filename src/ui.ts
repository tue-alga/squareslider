import * as PIXI from 'pixi.js';
import { Constants } from './squares-simulator';

abstract class Component {
	protected readonly pixi = new PIXI.Container();

	getPixi(): PIXI.DisplayObject {
		return this.pixi;
	}

	setPosition(x: number, y: number): void {
		this.pixi.x = x;
		this.pixi.y = y;
	}

	/**
	 * Reconstructs the component and stores it into this.pixi.
	 *
	 * This is called by the constructor to build the component for the first
	 * time, and can be called later when the component needs to be updated.
	 */
	abstract rebuildPixi(): void;

	abstract getWidth(): number;
	abstract getHeight(): number;
}

abstract class Button extends Component {
	static readonly BUTTON_HEIGHT = 48;
	static readonly BALLOON_HEIGHT = 34;

	clickHandler: (() => void) | null = null;

	protected enabled: boolean = true;
	protected pressed: boolean = false;

	protected balloon = new PIXI.Container();
	protected hovered: boolean = false;

	constructor(public tooltip: string,
		public tooltipAbove: boolean,
		public shortcut?: string,
		clickHandler?: () => void) {
		super();
		if (clickHandler) {
			this.clickHandler = clickHandler;
		}

		this.pixi.interactive = true;
		this.pixi.on('click', () => {
			if (this.enabled && this.clickHandler) {
				this.clickHandler();
			}
		});
		this.pixi.on('tap', () => {
			if (this.enabled && this.clickHandler) {
				this.clickHandler();
			}
		});
		this.pixi.on('mousemove', () => {
			this.hovered = true;
			this.balloon.visible = true;
		});
		this.pixi.on('mouseout', () => {
			this.hovered = false;
			this.balloon.visible = false;
		});
	}

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const background = this.getBackground();
		this.pixi.addChild(background);

		const foreground = this.getForeground();
		if (this.enabled) {
			foreground.alpha = 1;
		} else {
			foreground.alpha = 0.3;
		}
		this.pixi.addChild(foreground);

		this.balloon = new PIXI.Container();
		this.pixi.addChild(this.balloon);
		this.balloon.visible = this.hovered;
		if (!this.enabled) {
			this.balloon.alpha = 0.5;
		}

		let height = Button.BALLOON_HEIGHT;
		if (this.shortcut) {
			height += 12;
		}

		const y = this.tooltipAbove ? -height - 4 : this.getHeight() + 4;

		const balloonMetrics = PIXI.TextMetrics.measureText(this.tooltip, Constants.tooltipStyle);
		let balloonWidth = balloonMetrics.width + 28;

		const balloonShadow = new PIXI.Graphics();
		balloonShadow.beginFill(0x000000);
		balloonShadow.drawRoundedRect(
			(-balloonWidth + this.getWidth()) / 2,
			y,
			balloonWidth,
			height,
			height / 2);
		balloonShadow.endFill();
		balloonShadow.filters = [new PIXI.filters.BlurFilter(10)];
		balloonShadow.alpha = 0.3;
		this.balloon.addChild(balloonShadow);

		const balloonBackground = new PIXI.Graphics();
		balloonBackground.beginFill(0x222222);
		balloonBackground.drawRoundedRect(
			(-balloonWidth + this.getWidth()) / 2,
			y,
			balloonWidth,
			height,
			height / 2);
		balloonBackground.endFill();
		this.balloon.addChild(balloonBackground);

		const balloonText = new PIXI.Text(this.tooltip,
			Constants.tooltipStyle);
		balloonText.anchor.set(0.5, 0.5);
		balloonText.x = this.getWidth() / 2;
		balloonText.y = y + height / 2 - 1;
		this.balloon.addChild(balloonText);

		if (this.shortcut) {
			const shortcutText = new PIXI.Text("[" + this.shortcut + "]",
				Constants.tooltipSmallStyle);
			shortcutText.anchor.set(0.5, 0.5);
			shortcutText.x = this.getWidth() / 2;
			balloonText.y = y + height / 2 - 9;
			shortcutText.y = y + height / 2 + 9;
			this.balloon.addChild(shortcutText);
		}

		this.pixi.hitArea = new PIXI.Rectangle(0, 0,
			this.getWidth(), this.getHeight());
	}

	abstract getBackground(): PIXI.DisplayObject;
	abstract getForeground(): PIXI.DisplayObject;

	getHeight(): number {
		return Button.BUTTON_HEIGHT;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.rebuildPixi();
	}

	isPressed(): boolean {
		return this.pressed;
	}

	setPressed(pressed: boolean): void {
		this.pressed = pressed;
		this.rebuildPixi();
	}

	setTooltip(tooltip: string): void {
		this.tooltip = tooltip;
		this.rebuildPixi();
	}

	onClick(handler: () => void): void {
		this.clickHandler = handler;
		this.rebuildPixi();
	}

	removeOnClick() {
		this.clickHandler = null;
		this.rebuildPixi();
	}
}

class IconButton extends Button {

	constructor(public icon: string,
		public tooltip: string,
		public tooltipAbove: boolean,
		public shortcut?: string,
		clickHandler?: () => void) {
		super(tooltip, tooltipAbove, shortcut, clickHandler);
	}

	override getBackground() {
		const background = new PIXI.Graphics();
		if (this.pressed) {
			background.beginFill(0xdddddd);
		} else {
			background.beginFill(0xffffff);
		}
		background.drawCircle(
			IconButton.BUTTON_HEIGHT / 2,
			IconButton.BUTTON_HEIGHT / 2,
			IconButton.BUTTON_HEIGHT / 2);
		background.endFill();
		return background;
	}

	override getForeground() {
		const icon = new PIXI.Sprite(
			PIXI.Loader.shared.
				resources['icons/' + this.icon + '.png'].texture);
		icon.width = IconButton.BUTTON_HEIGHT;
		icon.height = IconButton.BUTTON_HEIGHT;
		return icon;
	}

	getWidth(): number {
		return IconButton.BUTTON_HEIGHT;
	}

	setIcon(icon: string): void {
		this.icon = icon;
		this.rebuildPixi();
	}
}

class TextButton extends Button {

	label = new PIXI.Text("", Constants.phaseLabelStyle);

	constructor(public text: string,
		public width: number,
		public tooltip: string,
		public tooltipAbove: boolean,
		public shortcut?: string,
		clickHandler?: () => void) {
		super(tooltip, tooltipAbove, shortcut, clickHandler);
	}

	override getBackground() {
		const background = new PIXI.Graphics();
		if (this.pressed) {
			background.beginFill(0xdddddd);
		} else {
			background.beginFill(0xffffff);
		}
		background.drawCircle(
			IconButton.BUTTON_HEIGHT / 2,
			IconButton.BUTTON_HEIGHT / 2,
			IconButton.BUTTON_HEIGHT / 2);
		background.endFill();
		return background;
	}

	override getForeground() {
		this.setText(this.text);
		this.label.anchor.set(0, 0.5);
		this.label.x = 0;
		this.label.y = this.getHeight() / 2;
		return this.label;
	}

	getWidth(): number {
		return this.width;
	}

	setText(text: string): void {
		this.text = text;
		this.label.text = text;
	}
}

class Separator extends Component {
	static readonly BUTTON_SIZE = 48;

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const line = new PIXI.Graphics();
		line.beginFill(0x222222);
		line.drawRect(
			10, 0,
			2,
			IconButton.BUTTON_HEIGHT);
		line.endFill();
		this.pixi.addChild(line);
	}

	getWidth(): number {
		return 22;
	}

	getHeight(): number {
		return IconButton.BUTTON_HEIGHT;
	}
}

class Toolbar extends Component {

	static readonly CORNER_RADIUS = 48;
	static readonly X_MARGIN = 22;
	static readonly Y_MARGIN = 16;
	static readonly BOTTOM_MARGIN = 4;

	private children: Component[] = [];

	constructor(public bottom: boolean) {
		super();
	}

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const width = this.getWidth();
		const height = this.getHeight();

		// background fill
		const background = new PIXI.Graphics();
		background.beginFill(0xffffff);
		background.drawRoundedRect(
			0, this.bottom ? 0 : -Toolbar.CORNER_RADIUS,
			width, height + Toolbar.CORNER_RADIUS,
			Toolbar.CORNER_RADIUS);
		background.endFill();
		background.interactive = true;

		// backdrop shadow
		const shadow = new PIXI.Graphics();
		shadow.beginFill(0x000000);
		shadow.drawRoundedRect(
			0, this.bottom ? 3 : -Toolbar.CORNER_RADIUS + 3,
			width, height + Toolbar.CORNER_RADIUS,
			Toolbar.CORNER_RADIUS);
		shadow.endFill();
		shadow.alpha = 0.3;
		shadow.filters = [new PIXI.filters.BlurFilter(10)];

		this.pixi.addChild(shadow, background);

		// children
		let x = Toolbar.X_MARGIN;
		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];
			child.setPosition(x, this.bottom ? Toolbar.Y_MARGIN : Toolbar.BOTTOM_MARGIN);
			x += child.getWidth() + Toolbar.X_MARGIN;
			this.pixi.addChild(child.getPixi());
		}
	}

	addChild(child: Component): void {
		child.rebuildPixi();
		this.children.push(child);
	}

	getWidth(): number {
		let width = 0;
		for (let i = 0; i < this.children.length; i++) {
			width += this.children[i].getWidth() + Toolbar.X_MARGIN;
		}
		return width + Toolbar.X_MARGIN;
	}

	getHeight(): number {
		let height = 0;
		for (let i = 0; i < this.children.length; i++) {
			height = Math.max(this.children[i].getHeight());
		}
		return height + Toolbar.Y_MARGIN + Toolbar.BOTTOM_MARGIN;
	}

	setVisible(visible: boolean): void {
		this.getPixi().visible = visible;
	}
}

class StepCountLabel extends Component {

	countText = new PIXI.Text("", Constants.stepCountStyle);

	constructor(public stepCount: number) {
		super();
		this.rebuildPixi();
		this.setStepCount(stepCount);
	}

	override getWidth() {
		return 80;
	}

	override getHeight() {
		return 50;
	}

	setStepCount(stepCount: number) {
		this.stepCount = stepCount;
		this.countText.text = "" + this.stepCount;
	}

	override rebuildPixi(): void {
		this.pixi.removeChildren();

		let stepText = new PIXI.Text("STEP", Constants.smallLabelStyle);
		stepText.anchor.set(0.5, 0.5);
		stepText.x = this.getWidth() / 2;
		stepText.y = this.getHeight() / 2 - 22;
		this.pixi.addChild(stepText);

		this.countText.anchor.set(0.5, 0.5);
		this.countText.x = this.getWidth() / 2;
		this.countText.y = this.getHeight() / 2 + 4;
		this.pixi.addChild(this.countText);
	}
}

class PhaseLabel extends Component {

	phaseText = new PIXI.Text("", Constants.phaseLabelStyle);
	subPhaseText = new PIXI.Text("", Constants.subPhaseLabelStyle);

	constructor() {
		super();
		this.rebuildPixi();
	}

	override getWidth() {
		return 500;
	}

	override getHeight() {
		return 50;
	}

	setPhase(phase: string) {
		this.phaseText.text = phase;
	}

	setSubPhase(subPhase: string) {
		this.subPhaseText.text = subPhase;
		if (subPhase == "") {
			this.phaseText.y = this.getHeight() / 2 - 4;
		} else {
			this.phaseText.y = this.getHeight() / 2 - 17;
		}
	}

	override rebuildPixi(): void {
		this.pixi.removeChildren();

		this.phaseText.anchor.set(0, 0.5);
		this.phaseText.x = 0;
		this.phaseText.y = this.getHeight() / 2 - 17;
		this.pixi.addChild(this.phaseText);

		this.subPhaseText.anchor.set(0, 0.5);
		this.subPhaseText.x = 0;
		this.subPhaseText.y = this.getHeight() / 2 + 9;
		this.pixi.addChild(this.subPhaseText);
	}
}

class Label extends Component {

	label = new PIXI.Text("", Constants.subPhaseLabelStyle);

	constructor(public text: string) {
		super();
		this.rebuildPixi();
	}

	override getWidth() {
		const labelMetrics = PIXI.TextMetrics.measureText(this.text, Constants.subPhaseLabelStyle);
		return labelMetrics.width;
	}

	override getHeight() {
		return Button.BUTTON_HEIGHT;
	}

	override rebuildPixi(): void {
		this.pixi.removeChildren();

		this.label.text = this.text;
		this.label.anchor.set(0, 0.5);
		this.label.x = 0;
		this.label.y = this.getHeight() / 2;
		this.pixi.addChild(this.label);
	}
}

export { IconButton, TextButton, Label, Separator, Toolbar, StepCountLabel, PhaseLabel };

