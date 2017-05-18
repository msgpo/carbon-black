'use strict';

polarity.export = PolarityComponent.extend({
    additionalFilesCount: 0,
    summaryFileLimit: 5,
    maxFilePathsToShow: 10,
    numFilePathsShown: Ember.computed('block.data.details.observed_filename.length', function(){
        var maxFilePathsToShow = this.get('maxFilePathsToShow');
        var totalFilePaths = this.get('block.data.details.observed_filename.length');
        if(totalFilePaths < maxFilePathsToShow){
            return totalFilePaths;
        }
        return maxFilePathsToShow;
    }),
    fileNames: Ember.computed('block.data.details.observed_filename', function(){
        var fullPaths = this.get('block.data.details.observed_filename');
        var summaryFileLimit = this.get('summaryFileLimit');
        var fileNames = Ember.A();
        if(Array.isArray(fullPaths)){
            for(var i=0; i<fullPaths.length && i < summaryFileLimit; i++){
                fileNames.pushObject(fullPaths[i].split('\\').pop().split('/').pop());
            }
        }
        var additionalFilesCount = fullPaths.length - fileNames.length;
        if(additionalFilesCount > 0){
            this.set('additionalFilesCount', additionalFilesCount);
        }else{
            this.set('additionalFilesCount', 0);
        }

        return fileNames;
    }),
    isUnsigned: Ember.computed('block.data.details.signed', function(){
        var signed = this.get('block.data.details.signed');
        if(signed.toLowerCase() === 'unsigned'){
            return true;
        }
        return false;
    })
});

