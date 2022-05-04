import { Algorithm, World } from '../world';

class CanonicalizeAlgorithm {

	constructor(public world: World) { }

	*execute(): Algorithm {
		printStep('Canonicalizing');

		try {
			while (true) {
				yield* this.doCanonicalizationMove();
			}
		} catch (e) {
			if (e === "done") {
				printStep("Execution finished");
				return;
			}
			throw e;
		}
	}

	*doCanonicalizationMove(): Algorithm {
		const [xMin, yMin] = this.highestMinPotentialEmptyCell();
		const [xMax, yMax] = this.lowestMaxPotentialSquare();

		if (xMin + yMin > xMax + yMax ||
			(xMin + yMin === xMax + yMax && yMin < yMax)) {
			throw "done";
		}

		yield* this.world.shortestMovePath([xMax, yMax], [xMin, yMin]);
	}

	lowestMaxPotentialSquare(): [number, number] {
		let max = -Infinity;
		let [xMax, yMax] = [-1, -1];
		for (const c of this.world.squares) {
			const potential = c.p[0] + c.p[1];
			if (potential > max ||
				(potential === max && c.p[1] < yMax)) {
				max = potential;
				[xMax, yMax] = [c.p[0], c.p[1]];
			}
		}
		return [xMax, yMax];
	}

	highestMinPotentialEmptyCell(): [number, number] {
		let min = Infinity;
		let [xMin, yMin] = [-1, -1];
		const check = function (x: number, y: number) {
			const potential = x + y;
			if (potential < min ||
				(potential === min && y > yMin)) {
				min = potential;
				[xMin, yMin] = [x, y];
			}
		}
		for (const square of this.world.squares) {
			if (!this.world.hasSquare([square.p[0], square.p[1] + 1])) {
				check(square.p[0], square.p[1] + 1);
			}
			if (!this.world.hasSquare([square.p[0] + 1, square.p[1]])) {
				check(square.p[0] + 1, square.p[1]);
			}
		}

		return [xMin, yMin];
	}
}

export { CanonicalizeAlgorithm };
