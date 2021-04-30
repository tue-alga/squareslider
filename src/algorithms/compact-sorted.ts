import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus, Color} from '../cube';
import {Vector} from '../vector';

class CompactSortedAlgorithm {

	CONSTRAIN_TO_CHUNK_BOUNDS = false;
	CORNER_MOVES_ONLY_BOUNDARY = false;

	constructor(public world: World) {}

	*execute(): Algorithm {
		printStep('Compacting');

		while (true) {
			let cubesSorted = [...this.world.cubes];
			cubesSorted.sort((a: Cube, b: Cube) => {
				const score = function (c: Cube): number {
					return Math.max(c.p[0], c.p[1]);
				};
				return score(b) - score(a);
			});

			let moves: Move[][] = [];

			const freeMove = this.findFreeMove(cubesSorted);
			if (freeMove !== null) {
				moves.push(freeMove);
			} else {
				const semiFreeMove = this.findSemiFreeMove(cubesSorted);
				if (semiFreeMove !== null) {
					moves.push(semiFreeMove);
				}
			}

			const topCornerMove = this.findTopCornerMove(cubesSorted);
			if (topCornerMove !== null) {
				moves.push(topCornerMove);
			} else {
				const bottomCornerMove = this.findBottomCornerMove(cubesSorted);
				if (bottomCornerMove !== null) {
					moves.push(bottomCornerMove);
				}
			}

			const horizontalChainMove = this.findHorizontalChainMove();
			if (horizontalChainMove !== null) {
				moves.push(horizontalChainMove);
			}
			const verticalChainMove = this.findVerticalChainMove();
			if (verticalChainMove !== null) {
				moves.push(verticalChainMove);
			}

			if (!moves.length) {
				break;
			}

			// sort on distance of the move from the origin (x + y)
			moves.sort((a: Move[], b: Move[]) => {
				const score = function (m: Move[]): number {
					let s = Math.max(m[0].sourcePosition()[0], m[0].sourcePosition()[1]);

					const last = m[m.length - 1];

					if (last.targetPosition()[1] > m[0].sourcePosition()[1]) {
						s -= 100000;
					}

					return s;
				};
				return score(b) - score(a);
			});
			const move = moves[0];
			for (let m of move) {
				yield m;
			}
		}
	}

	findFreeMove(cubesSorted: Cube[]): Move[] | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();

		for (let cube of cubesSorted) {
			if (//cube.componentStatus !== ComponentStatus.LINK_STABLE &&
					cube.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.S,
				MoveDirection.W,
				MoveDirection.SW,
				MoveDirection.WS
			];
			for (let direction of directions) {
				const move = new Move(this.world, cube.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
						target[0] >= minX && target[1] >= minY &&
						target[0] <= maxX && target[1] <= maxY &&
						(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(cube.chunkId, target)) &&
						this.preservesChunkiness(cube.p, target)
				) {
					return [move];
				}
			}
		}

		return null;
	}

	findSemiFreeMove(cubesSorted: Cube[]): Move[] | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();

		for (let cube of cubesSorted) {
			if (//cube.componentStatus !== ComponentStatus.LINK_STABLE &&
					cube.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.NW,
				MoveDirection.WN
			];
			for (let direction of directions) {
				const move = new Move(this.world, cube.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
						target[0] >= minX && target[1] >= minY &&
						target[0] <= maxX && target[1] <= maxY &&
						(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(cube.chunkId, target)) &&
						this.preservesChunkiness(cube.p, target)
				) {
					return [move];
				}
			}
		}

		return null;
	}

	withinChunkBounds(chunkId: number, coord: [number, number]): boolean {
		let [minX, minY, maxX, maxY] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
		for (let cube of this.world.cubes) {
			if (cube.chunkId === chunkId) {
				let [x, y] = cube.p;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		}
		return coord[0] >= minX && coord[0] <= maxX &&
				coord[1] >= minY && coord[1] <= maxY;
	}

	findTopCornerMove(cubesSorted: Cube[]): Move[] | null {

		for (let cube of cubesSorted) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// top corner move
			if (!neighbor['W'] && neighbor['N'] && neighbor['NW'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['N'].onBoundary && neighbor['NW'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['N'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['N'].p, [x - 1, y])) {
					return [
						new Move(this.world, cube.p, MoveDirection.W),
						new Move(this.world, neighbor['N'].p, MoveDirection.S),
					];
				}
			}

			if (!neighbor['S'] && neighbor['E'] && neighbor['SE'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['E'].onBoundary && neighbor['SE'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y - 1])) {
					return [
						new Move(this.world, cube.p, MoveDirection.S),
						new Move(this.world, neighbor['E'].p, MoveDirection.W),
					];
				}
			}
		}

		return null;
	}

	findBottomCornerMove(cubesSorted: Cube[]): Move[] | null {

		for (let cube of cubesSorted) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// bottom corner move
			if (!neighbor['W'] && neighbor['S'] && neighbor['SW'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['S'].onBoundary && neighbor['SW'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['S'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['S'].p, [x - 1, y])) {
					return [
						new Move(this.world, cube.p, MoveDirection.W),
						new Move(this.world, neighbor['S'].p, MoveDirection.N),
					];
				}
			}

			if (!neighbor['N'] && neighbor['E'] && neighbor['NE'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['E'].onBoundary && neighbor['NE'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y + 1])) {
					return [
						new Move(this.world, cube.p, MoveDirection.N),
						new Move(this.world, neighbor['E'].p, MoveDirection.W),
					];
				}
			}
		}

		return null;
	}

	preservesChunkiness(source: [number, number], target: [number, number]) {
		if (this.world.getCube(source)!.componentStatus !==
				ComponentStatus.CHUNK_STABLE) {
			throw 'tried to determine if moving unstable/non-chunk cube ' +
					'(' + source[0] + ', ' + source[1] + ') to ' +
					'(' + target[0] + ', ' + target[1] + ') ' +
					'preserves chunkiness';
		}

		let marks: ComponentStatus[] = [];
		for (let i = 0; i < this.world.cubes.length; i++) {
			marks.push(this.world.cubes[i].componentStatus);
		}
		this.world.moveCube(source, target);

		const self = this;
		const putBack = function () {
			self.world.moveCubeUnmarked(target, source);
			for (let i = 0; i < self.world.cubes.length; i++) {
				self.world.cubes[i].componentStatus = marks[i];
			}
		}

		// check if all neighbors are still in a chunk, and if they are all in
		// the same chunk
		const neighbors = this.world.getNeighbors(source);
		let chunk = -1;
		for (let neighbor of neighbors) {
			if (neighbor.componentStatus === ComponentStatus.LINK_STABLE ||
					neighbor.componentStatus === ComponentStatus.LINK_CUT ||
					(chunk !== -1 && neighbor.chunkId !== -1 && neighbor.chunkId !== chunk)) {
				putBack();
				return false;
			}
			if (neighbor.chunkId !== -1) {
				chunk = neighbor.chunkId;
			}
		}

		const targetStatus = this.world.getCube(target)!.componentStatus;
		if (targetStatus === ComponentStatus.LINK_STABLE ||
				targetStatus === ComponentStatus.LINK_CUT) {
			putBack();
			return false;
		}

		putBack();
		return true;
	}

	findHorizontalChainMove(): Move[] | null {
		let m: Move[] = [];
		const [minX, minY, maxX, maxY] = this.world.bounds();

		let firstCube: Cube | null = null;
		for (let x = maxX; x >= minX; x--) {
			if (this.world.hasCube([x, minY])) {
				const cube = this.world.getCube([x, minY])!;
				if (cube.componentStatus !== ComponentStatus.LINK_STABLE &&
						cube.componentStatus !== ComponentStatus.LINK_CUT) {
					firstCube = cube;
					break;
				}
			}
		}
		if (firstCube === null) {
			return null;
		}

		let lastCube: Cube | null = null;
		for (let x = firstCube.p[0]; x >= minX; x--) {
			if (!this.world.hasCube([x - 1, minY])) {
				lastCube = this.world.getCube([x, minY])!;
				break;
			}
		}
		if (!lastCube ||
				lastCube.componentStatus === ComponentStatus.LINK_STABLE ||
				lastCube.componentStatus === ComponentStatus.LINK_CUT) {
			return null;
		}
		let movedLooseSquare = false;
		if (this.world.degree(lastCube) === 1) {
			movedLooseSquare = true;
			m.push(new Move(this.world, lastCube.p, MoveDirection.N));
			lastCube = this.world.getCube([lastCube.p[0] + 1, lastCube.p[1]])!;
		}
		if (lastCube === null || lastCube.p[0] === minX) {
			return null;
		}
		if (firstCube.p[0] - lastCube.p[0] <= (movedLooseSquare ? 2 : 1)) {
			return null;
		}
		m.push(new Move(this.world, firstCube.p, MoveDirection.SW));
		for (let x = firstCube.p[0] - 1; x > lastCube.p[0]; x--) {
			m.push(new Move(this.world, [x, minY - 1], MoveDirection.W));
		}
		m.push(new Move(this.world, [lastCube.p[0], minY - 1], MoveDirection.WN));

		return m;
	}

	findVerticalChainMove(): Move[] | null {
		let m: Move[] = [];
		const [minX, minY, maxX, maxY] = this.world.bounds();

		let firstCube: Cube | null = null;
		for (let y = maxY; y >= minY; y--) {
			if (this.world.hasCube([minX, y])) {
				const cube = this.world.getCube([minX, y])!;
				if (cube.componentStatus !== ComponentStatus.LINK_STABLE &&
						cube.componentStatus !== ComponentStatus.LINK_CUT) {
					firstCube = cube;
					break;
				}
			}
		}
		if (firstCube === null) {
			return null;
		}

		let lastCube: Cube | null = null;
		for (let y = firstCube.p[1]; y >= minY; y--) {
			if (!this.world.hasCube([minX, y - 1])) {
				lastCube = this.world.getCube([minX, y])!;
				break;
			}
		}
		if (!lastCube ||
				lastCube.componentStatus === ComponentStatus.LINK_STABLE ||
				lastCube.componentStatus === ComponentStatus.LINK_CUT) {
			return null;
		}
		let movedLooseSquare = false;
		if (this.world.degree(lastCube) === 1) {
			movedLooseSquare = true;
			m.push(new Move(this.world, lastCube.p, MoveDirection.E));
			lastCube = this.world.getCube([lastCube.p[0], lastCube.p[1] + 1])!;
		}
		if (lastCube === null || lastCube.p[1] === minY) {
			return null;
		}
		if (firstCube.p[1] - lastCube.p[1] <= (movedLooseSquare ? 2 : 1)) {
			return null;
		}
		m.push(new Move(this.world, firstCube.p, MoveDirection.WS));
		for (let y = firstCube.p[1] - 1; y > lastCube.p[1]; y--) {
			m.push(new Move(this.world, [minX - 1, y], MoveDirection.S));
		}
		m.push(new Move(this.world, [minX - 1, lastCube.p[1]], MoveDirection.SE));

		return m;
	}
}

export {CompactSortedAlgorithm};

