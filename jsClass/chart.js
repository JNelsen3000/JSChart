// options can include:
//	buffer, refreshSpeed, minimumDisplayThreshold
class Chart {
	#data = null;
	#grayLine = 'rgb(155, 155, 155)';
	#barChangeArr = [1,10,19,23,27,35,43,49,54,59,64,69,74,78,80,82,84,86,89,90,91,92,93,94,95,96,97,98,99,100]
	#refreshSpeed = 25;

	constructor(id, data, options = {}){
		if (!data.datasets || !data.datasets.length) { throw new Error('No datasets provided'); }
		const dataLength = data.datasets[0].data.length;
		if (data.datasets.some(x => x.data.length != dataLength)) { throw new Error('Datasets do not have matching lengths'); }
		data.datasets.forEach(x => { if (!x.id) { x.id = this.getId(); } })
		this.#data = data;
		this.id = id;
		this.dataLength = dataLength;
		this.canvas = document.getElementById(id);
		if (!this.canvas) { throw new Error('No canvas element found with id ' + id) }
		this.context = this.canvas.getContext('2d');
		this.width = this.canvas.width;
		this.height = this.canvas.height;

		this.options = options;
		this.buffer = options.buffer ?? 40; // padding
		this.minimumDisplayThreshold = options.minimumDisplayThreshold ?? .1;

		this.clickTargets = [];

		this.offscreenCanvas = document.createElement('canvas');
		this.offscreenCanvas.width = this.width;
		this.offscreenCanvas.height = this.height;
		this.offscreenContext = this.offscreenCanvas.getContext('2d');

		const maxVal = this.maxVal;

		// get how much space each section takes up in chart
		this.sectionWidth = Math.floor((this.width - (this.buffer * 2)) / (this.dataLength - 1));

		// use largest value to determine what steps chart uses along Y axis
		this.verticalIncrement = Math.ceil(Math.min(1, maxVal / 10));

		// get grid unit, the size of a square on the grid
		this.unit = Math.floor((this.height - (this.buffer * 2)) / (Math.ceil(maxVal)));

		this.sectionCount = Math.ceil(Math.min(maxVal, 10));

		// get space allotted for each label in legend
		this.labelSpace = Math.floor((this.width - this.buffer) / this.#data.datasets.length);

		function handleChartClick(e) {
			// check chart click targets, sort by highest order, activate handler of first target
			const clicked = this.clickTargets
				.filter(t => this.withinRect(e.offsetX, e.offsetY, t.NW, t.SE))
				.sort((a,b) => b.order - a.order)
			if (clicked.length > 0) {
				e.preventDefault();
				e.stopPropagation();
				clicked[0].handler(e);
			}
		}
		const clickHandler = handleChartClick.bind(this);
		this.canvas.addEventListener('click', clickHandler)

		// bind methods
		this.drawLine = this.drawLine.bind(this);
		this.drawBars = this.drawBars.bind(this);
		this.drawStepped = this.drawStepped.bind(this);
		this.redraw = this.redraw.bind(this);
		this.clear = this.clear.bind(this);
		this.handleLegendClick = this.handleLegendClick.bind(this);

		this.redraw();
	}
	// largest value in datasets
	get maxVal(){
		return this.#data.datasets.reduce((acc,val) => {
			const highestInSet = val.data.slice().sort().reverse()[0];
			if (highestInSet > acc) { return highestInSet; }
			return acc;
		}, 0);
	}
	withinRect(x,y,rectNW,rectSE){
		return x >= rectNW.x && x <= rectSE.x && y >= rectNW.y && y <= rectSE.y;
	}
	clear(){
		this.context.clearRect(0,0,this.width,this.height);
		this.offscreenContext.clearRect(0,0,this.width,this.height);
		this.clickTargets = [];
	}
	redraw(){
		this.clear();
		this.drawYAxesOffscreen();
		this.drawXAxesOffscreen();
		this.drawLegendOffscreen();
		this.stampGrid();
		this.drawData();
	}
	drawYAxesOffscreen(){
		this.offscreenContext.font = '12px serif';
		this.offscreenContext.strokeStyle = this.#grayLine;
		this.offscreenContext.fillStyle = this.#grayLine;
		for (let i = 0; i < this.#data.datasets[0].data.length; i ++) {
			this.offscreenContext.beginPath();
			const x = (this.sectionWidth * i) + .5 + this.buffer;
			this.offscreenContext.moveTo(x, this.buffer);
			this.offscreenContext.lineTo(x, this.height - this.buffer);
			this.offscreenContext.stroke();
			if (this.#data.labels && this.#data.labels.length){
				const text = this.#data.labels[i] ?? 'N/A';
				const labelWidth = this.offscreenContext.measureText(text).width;
				this.offscreenContext.fillText(text, x - Math.floor(labelWidth / 2), this.height - (this.buffer / 3));
			}
		}
	}
	drawXAxesOffscreen(){
		const sectionHeight = Math.floor((this.height - (this.buffer * 2)) / this.sectionCount);
		this.offscreenContext.font = '12px serif';
		this.offscreenContext.strokeStyle = this.#grayLine;
		this.offscreenContext.fillStyle = this.#grayLine;
		for (let i = 0; i <= this.sectionCount; i++) {
			const y = this.height - (sectionHeight * i) - this.buffer + .5;
			this.offscreenContext.fillText(Math.floor(i * this.verticalIncrement), this.buffer / 4, y);
			this.offscreenContext.beginPath();
			this.offscreenContext.moveTo(this.buffer, y);
			this.offscreenContext.lineTo(this.width - this.buffer, y);
			this.offscreenContext.stroke();
		}
	}
	stampGrid(){
		this.context.drawImage(this.offscreenCanvas, 0, 0);
	}
	drawLegendOffscreen(){
		this.#data.datasets
			.sort((a,b) => a.order - b.order)
			.forEach((set, i) => {
				const labelOffset = (this.labelSpace * i) + this.buffer;
				this.drawLegendItemOffscreen(set, labelOffset);
			})
	}
	drawLegendItemOffscreen(set, labelOffset){
		const squarePaddingLeft = 7;
		this.offscreenContext.font = '12px serif';
		this.offscreenContext.strokeStyle = this.#grayLine;
		const fullLabel = set.label + ':';
		const y = this.buffer - (this.buffer / 5);
		this.offscreenContext.fillStyle = 'black';
		this.offscreenContext.fillText(fullLabel, labelOffset, y);
		const textMeasures = this.offscreenContext.measureText(fullLabel);
		const labelWidth = textMeasures.width;
		const labelHeight = textMeasures.fontBoundingBoxAscent + textMeasures.fontBoundingBoxDescent;
		this.offscreenContext.fillStyle = set.hide ? this.#grayLine : set.color;
		const squareSize = Math.floor(this.buffer / 3);
		this.offscreenContext.fillRect(labelOffset + labelWidth + squarePaddingLeft, y, squareSize, - squareSize);

		const clickTarget = {
			NW: { x: labelOffset, y: y - labelHeight },
			SE: { x: labelOffset + labelWidth + squareSize + squarePaddingLeft, y: y },
			datasetId: set.id,
			handler: (e) => { this.handleLegendClick(e, set.id) },
			order: set.order
		}
		this.clickTargets.push(clickTarget);
	}
	handleLegendClick(e, setId) {
		const dataset = this.#data.datasets.find(x => x.id == setId);
		dataset.hide = !dataset.hide;
		this.redraw();
	}
	drawData(){
		this.#data.datasets
			.filter(x => !x.hide)
			.sort((a,b) => a.order - b.order)
			.forEach(set => this.drawDataSet(set))
	}
	drawDataSet(set){
		if (!set.color){ throw new Error(`no color given for dataset ${set.label ?? ''}`) }
		let drawFunc = null;
		switch(set.type){
			case 'line':
				drawFunc = this.drawLine;
				break;
			case 'stepped':
				drawFunc = this.drawStepped;
				break;
			case 'bar':
				drawFunc = this.drawBars;
				break;
			default:
				throw new Error('invalid type given for dataset: ' + set.type);
		}
		return drawFunc(set);
	}
	drawLine(set){
		const clickPadding = 9;
		this.context.strokeStyle = set.color;
		this.context.lineWidth = set.lineWidth ?? 1;
		this.context.lineJoin = 'round';
		this.context.beginPath();
		const firstY = this.height - (set.data[0] * this.unit) - this.buffer
		this.context.moveTo(this.buffer, firstY);
		if (set.clickHandler){
			this.clickTargets.push({
				NW: { x: this.buffer - clickPadding, y: firstY - clickPadding },
				SE: { x: this.buffer + clickPadding, y: firstY + clickPadding },
				datasetId: set.id,
				handler: (e) => { set.clickHandler(e, set.data[0], set.id); },
				order: set.order
			})
		}
		set.data.slice(1).forEach((d, i) => {
			const x = (this.sectionWidth * (i + 1)) + .5 + this.buffer;
			const y = this.height - (d * this.unit) - this.buffer;
			this.context.lineTo(x, y);
			if (set.clickHandler){
				this.clickTargets.push({
					NW: { x: x - clickPadding, y: y - clickPadding },
					SE: { x: x + clickPadding, y: y + clickPadding },
					datasetId: set.id,
					handler: (e) => { set.clickHandler(e, d, set.id); },
					order: set.order
				})			
			}
		});
		this.context.stroke();
		this.context.lineWidth = 1;
	}
	drawStepped(set){
		const clickPadding = 9;
		this.context.strokeStyle = set.color;
		this.context.lineWidth = set.lineWidth ?? 1;
		this.context.lineJoin = 'miter';
		this.context.beginPath();
		const startY = this.height - (set.data[0] * this.unit) - this.buffer;
		this.context.moveTo(this.buffer, startY);
		const dataPointsAsSteps = [];
		dataPointsAsSteps.push({x: this.buffer, y: startY })
		set.data.slice(1).forEach((val, i) => {
			const y = this.height - (val * this.unit) - this.buffer;
			const prevVal = set.data[i];
			const prevY = this.height - (prevVal * this.unit) - this.buffer;
			const x = (this.sectionWidth * (i + 1)) + .5 + this.buffer;
			this.context.lineTo(x, prevY);
			// if val has changed, draw vertical line
			if (prevVal != val) {
				this.context.lineTo(x, y);
			}
			dataPointsAsSteps.push({x, y});
		});
		this.context.stroke();
		const pointWidth = (set.lineWidth ?? 1) / 2;
		dataPointsAsSteps.forEach((point, i) => {
			this.context.beginPath();
			this.context.arc(point.x, point.y, pointWidth, 0, 2 * Math.PI);
			this.context.fillStyle = set.color;
			this.context.fill();
			this.context.stroke();
			if (set.clickHandler){
				this.clickTargets.push({
					NW: { x: point.x - clickPadding, y: point.y - clickPadding },
					SE: { x: point.x + clickPadding, y: point.y + clickPadding },
					datasetId: set.id,
					handler: (e) => { set.clickHandler(e, set.data[i], set.id); },
					order: set.order
				})
			}
		})
		this.context.lineWidth = 1;
	}
	drawBars(set){
		this.context.strokeStyle = set.color;
		this.context.lineWidth = set.lineWidth ?? Math.floor(this.unit * .3);
		set.data.slice(0).forEach((val, i) => {
			this.context.beginPath();
			const x = (this.sectionWidth * (i)) + .5 + this.buffer;
			// show a fraction of a bar if value is too small to display
			const y = val < this.minimumDisplayThreshold ?
				(this.height - 2 - this.buffer) :
				(this.height - (this.unit * val) - this.buffer);
			this.context.moveTo(x, this.height - this.buffer);
			this.context.lineTo(x, y);
			this.context.stroke();
	
			if (set.clickHandler){
				const clickTarget = {
					NW: { x: x - (this.context.lineWidth / 2), y },
					SE: { x: x + (this.context.lineWidth / 2), y: this.height - this.buffer },
					datasetId: set.id,
					handler: (e) => { set.clickHandler(e, val, set.id) },
					order: set.order
				}
				this.clickTargets.push(clickTarget);
			}
		});
		this.context.lineWidth = 1;
	}
	updateData(newData){
		if (newData.datasets[0].data.length != this.dataLength) { throw new Error('Datasets do not have matching lengths in refreshData') }
		this.#data.datasets.forEach((x,i) => newData.datasets[i].id = x.id);
		const newMaxVal = newData.datasets.reduce((acc,val) => {
			const highestInSet = val.data.slice().sort().reverse()[0];
			if (highestInSet > acc) { return highestInSet; }
			return acc;
		}, 0);
		if (newMaxVal != this.maxVal){
			// recreate chart including grid
			this.#data = newData;
			this.redraw();
		} else {
			// reuse stamp
			const sorted = newData.datasets.sort((a,b) => a.order - b.order);
			const nextFrame = (percentIndex = 0) => {
				this.context.clearRect(0,0,this.width,this.height);
				this.stampGrid();
				if (percentIndex >= this.#barChangeArr.length) {
					sorted.forEach(x => this.drawDataSet(x))
					this.#data = newData;
				} else {
					const percentage = this.#barChangeArr[percentIndex] / 100;
					sorted.forEach((newVals,i) => {
						const oldVals = this.#data.datasets[i];
						const transitionData = {
							...oldVals,
							data: oldVals.data.map((oldVal, j) => {
								const newVal = newVals.data[j];
								const diff = Math.abs(oldVal - newVal);
								let midVal = (oldVal > newVal) ? (oldVal - (diff * percentage)) : ((diff * percentage) + oldVal)
								return midVal;
							})
						}
						this.drawDataSet(transitionData);
					})
					setTimeout(() => { nextFrame(percentIndex + 1)}, this.#refreshSpeed);
				}
			}
			setTimeout(nextFrame, this.#refreshSpeed);
		}
	}
	getId = (() => { let id = 0; return () => { id++; return id; } })()
}
