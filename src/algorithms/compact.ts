import { Algorithm, World, Move, MoveDirection } from '../world';
import { Square, ComponentStatus, Color } from '../square';
import { Vector } from '../vector';

type MoveCandidate = {
	'moves': Move[],
	'origin': [number, number],
	'description': string
};
class CompactAlgorithm {

	CONSTRAIN_TO_CHUNK_BOUNDS = false;
	CORNER_MOVES_ONLY_BOUNDARY = false;

	constructor(public world: World) { }

	*execute(): Algorithm {
		printStep('Compacting');

		while (!this.world.isXYMonotone()) {
			let squaresSorted = [...this.world.squares];
			squaresSorted.sort((a: Square, b: Square) => {
				const score = function (c: Square): number {
					return Math.max(c.p[0], c.p[1]);
				};
				return score(b) - score(a);
			});

			let bestMove: MoveCandidate | null = null;
			let maxScore = -Infinity;
			const tryMove = function (m: MoveCandidate) {
				const s = Math.max(m.origin[0], m.origin[1]);
				if (s > maxScore) {
					maxScore = s;
					bestMove = m;
				}
			}

			const freeMove = this.findFreeMove(squaresSorted);
			if (freeMove !== null) {
				tryMove(freeMove);
			} else {
				const semiFreeMove = this.findSemiFreeMove(squaresSorted);
				if (semiFreeMove !== null) {
					tryMove(semiFreeMove);
				}
			}

			const topCornerMove = this.findTopCornerMove(squaresSorted);
			if (topCornerMove !== null) {
				tryMove(topCornerMove);
			} else {
				const bottomCornerMove = this.findBottomCornerMove(squaresSorted);
				if (bottomCornerMove !== null) {
					tryMove(bottomCornerMove);
				}
			}

			const horizontalChainMove = this.findHorizontalChainMove();
			if (horizontalChainMove !== null) {
				tryMove(horizontalChainMove);
			}
			const verticalChainMove = this.findVerticalChainMove();
			if (verticalChainMove !== null) {
				tryMove(verticalChainMove);
			}

			if (bestMove === null) {
				throw new Error("No compacting move available while configuration " +
					"is not yet xy-monotone");
			}

			// @ts-ignore
			printMiniStep(bestMove.description);
			// @ts-ignore
			for (const m of bestMove.moves) {
				yield m;
			}
		}
	}

	findFreeMove(squaresSorted: Square[]): MoveCandidate | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();

		for (let square of squaresSorted) {
			if (//square.componentStatus !== ComponentStatus.LINK_STABLE &&
				square.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.S,
				MoveDirection.W,
				MoveDirection.SW,
				MoveDirection.WS
			];
			for (let direction of directions) {
				const move = new Move(this.world, square.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
					target[0] >= minX && target[1] >= minY &&
					target[0] <= maxX && target[1] <= maxY &&
					(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(square.chunkId, target)) &&
					this.preservesChunkiness(square.p, target)
				) {
					return {
						'moves': [move],
						'origin': square.p,
						'description': `LM-move (${square.p[0]}, ${square.p[1]}) \u2192 ${MoveDirection[direction]}`
					};
				}
			}
		}

		return null;
	}

	findSemiFreeMove(squaresSorted: Square[]): MoveCandidate | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();

		for (let square of squaresSorted) {
			if (//square.componentStatus !== ComponentStatus.LINK_STABLE &&
				square.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.NW,
				MoveDirection.WN
			];
			for (let direction of directions) {
				const move = new Move(this.world, square.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
					target[0] >= minX && target[1] >= minY &&
					target[0] <= maxX && target[1] <= maxY &&
					(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(square.chunkId, target)) &&
					this.preservesChunkiness(square.p, target)
				) {
					return {
						'moves': [move],
						'origin': square.p,
						'description': `LM-move (${square.p[0]}, ${square.p[1]}) \u2192 ${MoveDirection[direction]}`
					};
				}
			}
		}

		return null;
	}

	withinChunkBounds(chunkId: number, coord: [number, number]): boolean {
		let [minX, minY, maxX, maxY] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
		for (let square of this.world.squares) {
			if (square.chunkId === chunkId) {
				let [x, y] = square.p;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		}
		return coord[0] >= minX && coord[0] <= maxX &&
			coord[1] >= minY && coord[1] <= maxY;
	}

	findTopCornerMove(squaresSorted: Square[]): MoveCandidate | null {

		for (let square of squaresSorted) {
			const [x, y] = square.p;
			const neighbor = this.world.getNeighborMap(square.p);

			// top corner move
			if (!neighbor['W'] && neighbor['N'] && neighbor['NW'] &&
				(!this.CORNER_MOVES_ONLY_BOUNDARY ||
					(square.onBoundary && neighbor['N'].onBoundary && neighbor['NW'].onBoundary)) &&
				square.componentStatus === ComponentStatus.CHUNK_STABLE &&
				neighbor['N'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['N'].p, [x - 1, y])) {
					return {
						'moves': [
							new Move(this.world, square.p, MoveDirection.W),
							new Move(this.world, neighbor['N'].p, MoveDirection.S)
						],
						'origin': square.p,
						'description': `Top corner move into (${square.p[0] - 1}, ${square.p[1] - 1}) \u2192 WS`
					};
				}
			}

			if (!neighbor['S'] && neighbor['E'] && neighbor['SE'] &&
				(!this.CORNER_MOVES_ONLY_BOUNDARY ||
					(square.onBoundary && neighbor['E'].onBoundary && neighbor['SE'].onBoundary)) &&
				square.componentStatus === ComponentStatus.CHUNK_STABLE &&
				neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y - 1])) {
					return {
						'moves': [
							new Move(this.world, square.p, MoveDirection.S),
							new Move(this.world, neighbor['E'].p, MoveDirection.W),
						],
						'origin': square.p,
						'description': `Top corner move into (${square.p[0] - 1}, ${square.p[1] - 1}) \u2192 SW`
					};
				}
			}
		}

		return null;
	}

	findBottomCornerMove(squaresSorted: Square[]): MoveCandidate | null {

		for (let square of squaresSorted) {
			const [x, y] = square.p;
			const neighbor = this.world.getNeighborMap(square.p);

			// bottom corner move
			if (!neighbor['W'] && neighbor['S'] && neighbor['SW'] &&
				(!this.CORNER_MOVES_ONLY_BOUNDARY ||
					(square.onBoundary && neighbor['S'].onBoundary && neighbor['SW'].onBoundary)) &&
				square.componentStatus === ComponentStatus.CHUNK_STABLE &&
				neighbor['S'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['S'].p, [x - 1, y])) {
					return {
						'moves': [
							new Move(this.world, square.p, MoveDirection.W),
							new Move(this.world, neighbor['S'].p, MoveDirection.N),
						],
						'origin': square.p,
						'description': `Bottom corner move into (${square.p[0] - 1}, ${square.p[1] - 1}) \u2192 WN`
					};
				}
			}

			if (!neighbor['N'] && neighbor['E'] && neighbor['NE'] &&
				(!this.CORNER_MOVES_ONLY_BOUNDARY ||
					(square.onBoundary && neighbor['E'].onBoundary && neighbor['NE'].onBoundary)) &&
				square.componentStatus === ComponentStatus.CHUNK_STABLE &&
				neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y + 1])) {
					return {
						'moves': [
							new Move(this.world, square.p, MoveDirection.N),
							new Move(this.world, neighbor['E'].p, MoveDirection.W),
						],
						'origin': square.p,
						'description': `Bottom corner move into (${square.p[0] - 1}, ${square.p[1] - 1}) \u2192 NW`
					};
				}
			}
		}

		return null;
	}

	preservesChunkiness(source: [number, number], target: [number, number]) {
		const sourceSquare = this.world.getSquare(source);
		if (sourceSquare === null) {
			throw new Error('Tried to determine if moving square ' +
				'(' + source[0] + ', ' + source[1] + ') to ' +
				'(' + target[0] + ', ' + target[1] + ') ' +
				'preserves chunkiness, but that source square ' +
				'does not exist');
		}
		if (sourceSquare.componentStatus !== ComponentStatus.CHUNK_STABLE) {
			throw new Error('Tried to determine if moving unstable/non-chunk square ' +
				'(' + source[0] + ', ' + source[1] + ') to ' +
				'(' + target[0] + ', ' + target[1] + ') ' +
				'preserves chunkiness');
		}
		if (this.world.hasSquare(target)) {
			throw new Error('Tried to determine if moving square ' +
				'(' + source[0] + ', ' + source[1] + ') to ' +
				'(' + target[0] + ', ' + target[1] + ') ' +
				'preserves chunkiness, but that target square ' +
				'already exists');
		}

		let marks: ComponentStatus[] = [];
		for (let i = 0; i < this.world.squares.length; i++) {
			marks.push(this.world.squares[i].componentStatus);
		}
		this.world.moveSquare(sourceSquare, target);

		const self = this;
		const putBack = function () {
			self.world.moveSquareUnmarked(sourceSquare, source);
			for (let i = 0; i < self.world.squares.length; i++) {
				self.world.squares[i].setComponentStatus(marks[i]);
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

		const targetStatus = this.world.getSquare(target)!.componentStatus;
		if (targetStatus === ComponentStatus.LINK_STABLE ||
			targetStatus === ComponentStatus.LINK_CUT) {
			putBack();
			return false;
		}

		putBack();
		return true;
	}

	findHorizontalChainMove(): MoveCandidate | null {
		let m: Move[] = [];
		const [minX, minY, maxX, maxY] = this.world.bounds();

		let firstSquare: Square | null = null;
		for (let x = maxX; x >= minX; x--) {
			if (this.world.hasSquare([x, minY])) {
				const square = this.world.getSquare([x, minY])!;
				if (square.componentStatus !== ComponentStatus.LINK_STABLE &&
					square.componentStatus !== ComponentStatus.LINK_CUT) {
					firstSquare = square;
					break;
				}
			}
		}
		if (firstSquare === null) {
			return null;
		}

		let lastSquare: Square | null = null;
		for (let x = firstSquare.p[0]; x >= minX; x--) {
			if (!this.world.hasSquare([x - 1, minY])) {
				lastSquare = this.world.getSquare([x, minY])!;
				break;
			}
		}
		if (!lastSquare ||
			lastSquare.componentStatus === ComponentStatus.LINK_STABLE ||
			lastSquare.componentStatus === ComponentStatus.LINK_CUT) {
			return null;
		}
		let movedLooseSquare = false;
		if (this.world.degree(lastSquare) === 1) {
			movedLooseSquare = true;
			m.push(new Move(this.world, lastSquare.p, MoveDirection.N));
			lastSquare = this.world.getSquare([lastSquare.p[0] + 1, lastSquare.p[1]])!;
		}
		if (lastSquare === null || lastSquare.p[0] === minX) {
			return null;
		}
		if (firstSquare.p[0] - lastSquare.p[0] <= 1) {
			return null;
		}
		if (!this.preservesChunkiness(firstSquare.p,
			[lastSquare.p[0] - 1, lastSquare.p[1] + (movedLooseSquare ? 1 : 0)])) {
			return null;
		}
		m.push(new Move(this.world, firstSquare.p, MoveDirection.SW));
		for (let x = firstSquare.p[0] - 1; x > lastSquare.p[0]; x--) {
			m.push(new Move(this.world, [x, minY - 1], MoveDirection.W));
		}
		m.push(new Move(this.world, [lastSquare.p[0], minY - 1], MoveDirection.WN));

		return {
			'moves': m,
			'origin': (movedLooseSquare ? m[1] : m[0]).sourcePosition(),
			'description': `Horizontal chain move from (${firstSquare.p[0]}, ${firstSquare.p[1]}) to (${lastSquare.p[0] - 1}, ${lastSquare.p[1]})`
		};
	}

	findVerticalChainMove(): MoveCandidate | null {
		let m: Move[] = [];
		const [minX, minY, maxX, maxY] = this.world.bounds();

		let firstSquare: Square | null = null;
		for (let y = maxY; y >= minY; y--) {
			if (this.world.hasSquare([minX, y])) {
				const square = this.world.getSquare([minX, y])!;
				if (square.componentStatus !== ComponentStatus.LINK_STABLE &&
					square.componentStatus !== ComponentStatus.LINK_CUT) {
					firstSquare = square;
					break;
				}
			}
		}
		if (firstSquare === null) {
			return null;
		}

		let lastSquare: Square | null = null;
		for (let y = firstSquare.p[1]; y >= minY; y--) {
			if (!this.world.hasSquare([minX, y - 1])) {
				lastSquare = this.world.getSquare([minX, y])!;
				break;
			}
		}
		if (!lastSquare ||
			lastSquare.componentStatus === ComponentStatus.LINK_STABLE ||
			lastSquare.componentStatus === ComponentStatus.LINK_CUT) {
			return null;
		}
		let movedLooseSquare = false;
		if (this.world.degree(lastSquare) === 1) {
			movedLooseSquare = true;
			m.push(new Move(this.world, lastSquare.p, MoveDirection.E));
			lastSquare = this.world.getSquare([lastSquare.p[0], lastSquare.p[1] + 1])!;
		}
		if (lastSquare === null || lastSquare.p[1] === minY) {
			return null;
		}
		if (firstSquare.p[1] - lastSquare.p[1] <= 1) {
			return null;
		}
		if (!this.preservesChunkiness(firstSquare.p,
			[lastSquare.p[0] + (movedLooseSquare ? 1 : 0), lastSquare.p[1] - 1])) {
			return null;
		}
		m.push(new Move(this.world, firstSquare.p, MoveDirection.WS));
		for (let y = firstSquare.p[1] - 1; y > lastSquare.p[1]; y--) {
			m.push(new Move(this.world, [minX - 1, y], MoveDirection.S));
		}
		m.push(new Move(this.world, [minX - 1, lastSquare.p[1]], MoveDirection.SE));

		return {
			'moves': m,
			'origin': (movedLooseSquare ? m[1] : m[0]).sourcePosition(),
			'description': `Vertical chain move from (${firstSquare.p[0]}, ${firstSquare.p[1]}) to (${lastSquare.p[0]}, ${lastSquare.p[1] - 1})`
		};
	}
}

export { CompactAlgorithm };
