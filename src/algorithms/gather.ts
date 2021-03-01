import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus} from '../cube';

class GatherAlgorithm {

    constructor(public world: World) {}

	*execute(): Algorithm {

		// find light square s
		// find two empty spaces around s to be filled
		// find extremal stable square to move in the descendants of s
		// move it
		// handle special pocket cases

		const lightSquare = this.findLightSquare()!;
		console.log('light square:', lightSquare.p);
		const toFill = this.findChunkifyingNeighbors(lightSquare);
		console.log('chunkifying:', toFill);

		for (const f of toFill) {
			const leaf = this.findLeafInDescendants(lightSquare)!;
			console.log('leaf:', leaf.p);
			yield* this.world.shortestMovePath(leaf.p, f);
		}

		//yield new Move(this.world, [0, 0], MoveDirection.WN);
		//return;

		/*try {
			while (true) {
				yield* this.world.doAnyFreeMove();
			}
		} catch (e) {
			// continue;
		}*/
	}

	/**
	 * Finds a light square closest to the root, or null if there are no light
	 * squares in the configuration.
	 */
	findLightSquare(): Cube | null {
		const outside = this.world.outsideCubes();
		const limit = this.world.bridgeLimit();
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			if (cube.componentStatus === ComponentStatus.CONNECTOR ||
					cube.componentStatus === ComponentStatus.LINK_CUT) {
				const capacity = this.world.bridgeCapacity(cube).length;
				if (capacity < limit) {
					return cube;
				}
			}
		}
		return null;
	}

	/**
	 * Given a light square s with bridge capacity at least 3, finds one or
	 * two neighbors of the given square, for which filling them would include
	 * the square into a chunk.
	 *
	 * The returned array may include cells that are already filled.
	 */
	findChunkifyingNeighbors(c: Cube): [number, number][] {
		const has = this.world.neighbors(c.p);
		const [x, y] = c.p;

		// if we have a corner, simply fill the corner
		if (has['N'] && has['W']) {
			return [[x - 1, y + 1]];
		} else if (has['N'] && has['E']) {
			return [[x + 1, y + 1]];
		} else if (has['S'] && has['W']) {
			return [[x - 1, y - 1]];
		} else if (has['S'] && has['E']) {
			return [[x + 1, y - 1]];
		}

		// a light square cannot be a leaf, so the only possible neighbor
		// patterns are N-S and W-E
		// fill a remaining 4-neighbor, plus the resulting corner
		if (has['S']) {
			return [[x + 1, y], [x + 1, y + 1]];
		} else {
			return [[x, y + 1], [x + 1, y + 1]];
		}
	}

	/**
	 * Given a light square s, return a square from the descendants of s that
	 * can be safely removed to chunkify s.
	 */
	findLeafInDescendants(c: Cube): Cube | null {

		let seen = Array(this.world.cubes.length).fill(false);
		const outside = this.world.outsideCubes();
		const startIndex = outside.indexOf(c);
		let stack = [];

		// walk over the outside
		for (let i = startIndex; i < outside.length; i++) {
			let cube = outside[i];
			const cubeId = this.world.cubes.indexOf(cube);

			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);

			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				// found link stable square
				return this.world.cubes[stack[stack.length - 1]];

			} else {
				// found leaf chunk
				while (true) {
					const c1 = this.world.cubes[stack[stack.length - 1]];
					const c2 = this.world.cubes[stack[stack.length - 2]];
					const c3 = this.world.cubes[stack[stack.length - 3]];
					const dx1 = c2.p[0] - c1.p[0];
					const dy1 = c2.p[1] - c1.p[1];
					const dx2 = c3.p[0] - c2.p[0];
					const dy2 = c3.p[1] - c2.p[1];
					// right turn or U-turn?
					if ((dx1 === -dy2 && dy1 === dx2) ||
							(dx1 === -dx2 && dy1 === -dy2)) {
						return c2;
					}
					stack.pop();
				}
			}
		}

		return null;
	}
}

export {GatherAlgorithm};

