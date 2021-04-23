import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus, Color} from '../cube';
import {Vector} from '../vector';

class CompactAlgorithm {

	CONSTRAIN_TO_CHUNK_BOUNDS = false;
	CORNER_MOVES_ONLY_BOUNDARY = false;

	constructor(public world: World) {}

	*execute(): Algorithm {
		printStep('Compacting');

		// is there a free move maintaining chunkiness? do it
		let move: Move[] | null;
		while ((move = this.findFreeMove()) ||
				(move = this.findCornerMove()) ||
				(move = this.findHorizontalChainMove()) ||
				(move = this.findVerticalChainMove())) {
			for (let m of move) {
				yield m;
			}
		}

		// is there a corner move maintaining chunkiness? do it
		// repeat until nothing possible
	}

	findFreeMove(): Move[] | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();
		for (let cube of this.world.cubes) {
			if (//cube.componentStatus !== ComponentStatus.LINK_STABLE &&
					cube.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.S,
				MoveDirection.W,
				MoveDirection.SW,
				MoveDirection.WS,
				MoveDirection.NW,
				MoveDirection.WN
			];
			for (let direction of directions) {
				const move = new Move(this.world, cube.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
						target[0] >= minX && target[1] >= minY &&
						(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(cube.chunkId, target)) &&
						this.preservesChunkiness(cube.p, target)
				) {
					printMiniStep(`Free move`);
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

	findCornerMove(): Move[] | null {

		for (let cube of this.world.cubes) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// top corner move
			if (!neighbor['W'] && neighbor['N'] && neighbor['NW'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['N'].onBoundary && neighbor['NW'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['N'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['N'].p, [x - 1, y])) {
					printMiniStep(`Top corner move`);
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
					printMiniStep(`Top corner move`);
					return [
						new Move(this.world, cube.p, MoveDirection.S),
						new Move(this.world, neighbor['E'].p, MoveDirection.W),
					];
				}
			}
		}

		for (let cube of this.world.cubes) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// bottom corner move
			if (!neighbor['W'] && neighbor['S'] && neighbor['SW'] &&
					(!this.CORNER_MOVES_ONLY_BOUNDARY ||
							(cube.onBoundary && neighbor['S'].onBoundary && neighbor['SW'].onBoundary)) &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['S'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['S'].p, [x - 1, y])) {
					printMiniStep(`Bottom corner move`);
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
					printMiniStep(`Bottom corner move`);
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
		let moves: Move[] = [];
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
		lastCube = lastCube!;
		if (lastCube.componentStatus === ComponentStatus.LINK_STABLE ||
				lastCube.componentStatus === ComponentStatus.LINK_CUT) {
			throw "chain move destination was not in chunk, that shouldn't happen";
		}
		if (this.world.degree(lastCube) === 1) {
			moves.push(new Move(this.world, lastCube.p, MoveDirection.N));
			lastCube = this.world.getCube([lastCube.p[0] + 1, lastCube.p[1]])!;
		}
		if (lastCube.p[0] === minX) {
			return null;
		}
		moves.push(new Move(this.world, firstCube.p, MoveDirection.SW));
		for (let x = firstCube.p[0] - 1; x > lastCube.p[0]; x--) {
			moves.push(new Move(this.world, [x, minY - 1], MoveDirection.W));
		}
		moves.push(new Move(this.world, [lastCube.p[0], minY - 1], MoveDirection.WN));

		return moves;
	}

	findVerticalChainMove(): Move[] | null {
		let moves: Move[] = [];
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
		lastCube = lastCube!;
		if (lastCube.componentStatus === ComponentStatus.LINK_STABLE ||
				lastCube.componentStatus === ComponentStatus.LINK_CUT) {
			throw "chain move destination was not in chunk, that shouldn't happen";
		}
		if (this.world.degree(lastCube) === 1) {
			moves.push(new Move(this.world, lastCube.p, MoveDirection.E));
			lastCube = this.world.getCube([lastCube.p[0], lastCube.p[1] + 1])!;
		}
		if (lastCube.p[1] === minY) {
			return null;
		}
		moves.push(new Move(this.world, firstCube.p, MoveDirection.WS));
		for (let y = firstCube.p[1] - 1; y > lastCube.p[1]; y--) {
			moves.push(new Move(this.world, [minX - 1, y], MoveDirection.S));
		}
		moves.push(new Move(this.world, [minX - 1, lastCube.p[1]], MoveDirection.SE));

		return moves;
	}
}

export {CompactAlgorithm};

