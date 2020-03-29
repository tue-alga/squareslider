let entry = __dirname + '/src/index.ts';
let outputPath = __dirname + '/dist';

if (process.env.TESTBUILD) {
    entry = __dirname + '/test/index.test.ts';
    outputPath = __dirname + '/test-dist';
}

module.exports = {
    mode: 'development',
    entry: entry,
    devtool: 'inline-source-map',
    devServer: {
        contentBase: __dirname + '/dist'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: '/node_modules'
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        path: outputPath
    }
};

